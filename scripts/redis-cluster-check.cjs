#!/usr/bin/env node
'use strict';

/**
 * Verifies the redis provider never issues a cluster-illegal command.
 *
 * Redis Cluster rejects any command touching keys in more than one hash slot:
 *
 *   CROSSSLOT Keys in request don't hash to the same slot
 *
 * Cache keys are derived from request paths, so they spread across slots by
 * construction. A batched UNLINK, or a MULTI spanning them, therefore fails on
 * a cluster while working perfectly on a standalone server - which is why this
 * is worth asserting rather than eyeballing.
 *
 * Running a real cluster in CI is disproportionate, so this drives the provider
 * against a recording client that reports itself as clustered and captures the
 * exact commands issued.
 *
 * @see https://github.com/strapi-community/plugin-rest-cache/issues/100
 */

const assert = require('assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { RedisCacheProvider } = require(
  path.join(ROOT, 'packages/provider-rest-cache-redis/dist/RedisCacheProvider.js')
);

/** Commands that address more than one key, and so must be slot-safe. */
const MULTI_KEY = new Set(['unlink', 'del', 'mget', 'mset']);

function recordingClient({ isCluster }) {
  const issued = [];
  const members = new Set();

  const client = {
    isCluster,
    issued,
    async smembers() {
      return [...members];
    },
    async unlink(...keys) {
      issued.push({ cmd: 'unlink', keys: keys.flat() });
      for (const key of keys.flat()) members.delete(key);
      return keys.flat().length;
    },
    async srem(_set, ...keys) {
      issued.push({ cmd: 'srem', keys: keys.flat() });
      return keys.flat().length;
    },
    multi() {
      const queued = [];
      return {
        unlink: (...keys) => queued.push({ cmd: 'unlink', keys: keys.flat() }),
        srem: (_set, ...keys) => queued.push({ cmd: 'srem', keys: keys.flat() }),
        async exec() {
          issued.push({ cmd: 'multi', queued });
          for (const q of queued) if (q.cmd === 'unlink') for (const k of q.keys) members.delete(k);
          return [];
        },
      };
    },
    seed(keys) {
      for (const key of keys) members.add(key);
    },
  };

  return client;
}

/**
 * A node-redis client, standalone or cluster, that records what it is asked.
 * Same command names and argument shapes as @redis/client: arrays for
 * multi-key commands, camelCase methods, a chainable multi().
 */
function recordingNodeRedis({ isCluster }) {
  const issued = [];
  const members = new Set();
  const flat = (k) => [k].flat();

  const run = {
    set: (key) => {
      issued.push({ cmd: 'set', keys: [key] });
      return 'OK';
    },
    sAdd: (_set, m) => {
      for (const k of flat(m)) members.add(k);
      return flat(m).length;
    },
    sRem: (_set, m) => {
      issued.push({ cmd: 'srem', keys: flat(m) });
      for (const k of flat(m)) members.delete(k);
      return flat(m).length;
    },
    unlink: (k) => {
      issued.push({ cmd: 'unlink', keys: flat(k) });
      for (const key of flat(k)) members.delete(key);
      return flat(k).length;
    },
  };

  return {
    isCluster,
    isReady: true,
    issued,
    members,
    seed(keys) {
      for (const key of keys) members.add(key);
    },
    async get(key) {
      issued.push({ cmd: 'get', keys: [key] });
      return null;
    },
    async mGet(keys) {
      issued.push({ cmd: 'mget', keys });
      return keys.map(() => null);
    },
    async set(key) {
      return run.set(key);
    },
    async sAdd(set, m) {
      return run.sAdd(set, m);
    },
    async sRem(set, m) {
      return run.sRem(set, m);
    },
    async unlink(k) {
      return run.unlink(k);
    },
    async sMembers() {
      return [...members];
    },
    async scan() {
      issued.push({ cmd: 'scan', keys: [] });
      return { cursor: '0', keys: [] };
    },
    multi() {
      const queued = [];
      const chain = {
        set: (key) => (queued.push({ cmd: 'set', keys: [key] }), chain),
        sAdd: (set, m) => (queued.push({ cmd: 'sadd', set, keys: flat(m) }), chain),
        sRem: (set, m) => (queued.push({ cmd: 'srem', set, keys: flat(m) }), chain),
        unlink: (k) => (queued.push({ cmd: 'unlink', keys: flat(k) }), chain),
        async exec() {
          issued.push({ cmd: 'multi', queued });
          for (const q of queued) {
            if (q.cmd === 'unlink' || q.cmd === 'srem') for (const k of q.keys) members.delete(k);
            if (q.cmd === 'sadd') for (const k of q.keys) members.add(k);
          }
          return queued.map(() => 1);
        },
      };
      return chain;
    },
  };
}

/** Swap the provider's underlying store for our recorder. */
function withClient(provider, client) {
  provider.cache.stores[0].opts.store = {
    redis: client,
    namespace: 'keyv',
    opts: { useRedisSets: true },
    _getNamespace: () => 'namespace:keyv',
  };
  return provider;
}

function makeProvider(client) {
  // Construct against a stub, then replace the store with the recorder.
  const provider = Object.create(RedisCacheProvider.prototype);
  provider.cache = { stores: [{ opts: {} }] };
  return withClient(provider, client);
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push([true, name, '']);
  } catch (error) {
    results.push([false, name, error.message.split('\n')[0]]);
  }
}

(async () => {
  const KEYS = Array.from({ length: 40 }, (_, i) => `/api/articles?page=${i}&`);
  const qualified = KEYS.map((k) => `keyv:${k}`);

  await check('cluster: delMany issues no multi-key command', async () => {
    const client = recordingClient({ isCluster: true });
    client.seed(qualified);
    const provider = makeProvider(client);

    await provider.delMany(KEYS);

    const offending = client.issued.filter(
      (c) => MULTI_KEY.has(c.cmd) && c.keys.length > 1
    );
    assert.deepStrictEqual(
      offending,
      [],
      `issued ${offending.length} multi-key command(s), e.g. ${JSON.stringify(offending[0])}`
    );

    assert.strictEqual(
      client.issued.some((c) => c.cmd === 'multi'),
      false,
      'used MULTI, which cannot span hash slots'
    );

    assert.strictEqual(
      client.issued.filter((c) => c.cmd === 'unlink').length,
      KEYS.length,
      'every key should be unlinked individually'
    );
  });

  await check('cluster: SREM against the tracking set may stay batched', async () => {
    const client = recordingClient({ isCluster: true });
    client.seed(qualified);
    const provider = makeProvider(client);

    await provider.delMany(KEYS);

    const srems = client.issued.filter((c) => c.cmd === 'srem');
    assert.ok(srems.length >= 1, 'expected the tracking set to be updated');
    // One key (the set), so batching members is safe and desirable.
    assert.ok(srems.length < KEYS.length, 'SREM should not be issued per key');
  });

  await check('cluster: clear() deletes key by key', async () => {
    const client = recordingClient({ isCluster: true });
    client.seed(qualified);
    const provider = makeProvider(client);

    await provider.clear();

    const offending = client.issued.filter(
      (c) => MULTI_KEY.has(c.cmd) && c.keys.length > 1
    );
    assert.deepStrictEqual(offending, [], 'clear() issued a multi-key command');
  });

  await check('cluster: keys() reads the tracking set, never SCAN', async () => {
    const client = recordingClient({ isCluster: true });
    client.seed(qualified);
    // SCAN would only address one node, so its absence is the point.
    client.scan = () => {
      throw new Error('SCAN must not be used: it only covers a single node');
    };
    const provider = makeProvider(client);

    const keys = await provider.keys();
    assert.strictEqual(keys.length, KEYS.length);
    assert.ok(keys.every((k) => !k.startsWith('keyv:')), 'keys should be unqualified');
  });

  await check('standalone: delMany still batches into MULTI', async () => {
    const client = recordingClient({ isCluster: false });
    client.seed(qualified);
    const provider = makeProvider(client);

    await provider.delMany(KEYS);

    const multis = client.issued.filter((c) => c.cmd === 'multi');
    assert.strictEqual(multis.length, 1, 'expected a single batched MULTI');
    assert.strictEqual(multis[0].queued[0].keys.length, KEYS.length);
  });

  // plugin-redis v3: the same guarantees on the node-redis store. Driven
  // through a real provider, constructed the way init() does on v3, so the
  // store and its wiring are what is under test. See
  // https://github.com/strapi-community/plugin-rest-cache/pull/239
  const v3 = (isCluster) => {
    const client = recordingNodeRedis({ isCluster });
    const provider = new RedisCacheProvider(null, {}, { client, isCluster });
    return { client, provider };
  };

  await check('v3 cluster: set() never uses MULTI', async () => {
    const { client, provider } = v3(true);
    await provider.set(KEYS[0], { a: 1 }, 60000);

    assert.strictEqual(client.issued.some((c) => c.cmd === 'multi'), false, 'set() used MULTI');
    assert.ok(client.members.has(qualified[0]), 'set() did not track the key');
  });

  await check('v3 cluster: delMany issues no multi-key command', async () => {
    const { client, provider } = v3(true);
    client.seed(qualified);
    await provider.delMany(KEYS);

    const offending = client.issued.filter((c) => MULTI_KEY.has(c.cmd) && c.keys.length > 1);
    assert.deepStrictEqual(offending, [], `issued ${JSON.stringify(offending[0])}`);
    assert.strictEqual(client.issued.some((c) => c.cmd === 'multi'), false, 'used MULTI');
    assert.strictEqual(client.issued.filter((c) => c.cmd === 'unlink').length, KEYS.length);
    assert.ok(client.issued.filter((c) => c.cmd === 'srem').length < KEYS.length);
  });

  await check('v3 cluster: clear() deletes key by key', async () => {
    const { client, provider } = v3(true);
    client.seed(qualified);
    await provider.clear();

    const offending = client.issued.filter((c) => MULTI_KEY.has(c.cmd) && c.keys.length > 1);
    assert.deepStrictEqual(offending, [], 'clear() issued a multi-key command');
    assert.strictEqual(client.issued.some((c) => c.cmd === 'multi'), false, 'clear() used MULTI');
    assert.strictEqual(client.members.size, 0, 'clear() left tracked keys');
  });

  await check('v3 cluster: keys() reads the tracking set, never SCAN', async () => {
    const { client, provider } = v3(true);
    client.seed(qualified);
    const keys = await provider.keys();

    assert.strictEqual(client.issued.some((c) => c.cmd === 'scan'), false);
    assert.strictEqual(keys.length, KEYS.length);
    assert.ok(keys.every((k) => !k.startsWith('keyv:')), 'keys should be unqualified');
  });

  await check('v3 cluster: reading several entries never uses MGET', async () => {
    const { client, provider } = v3(true);
    await provider.cache.mget(KEYS.slice(0, 5));

    const offending = client.issued.filter((c) => MULTI_KEY.has(c.cmd) && c.keys.length > 1);
    assert.deepStrictEqual(offending, [], `issued ${JSON.stringify(offending[0])}`);
  });

  await check('v3 standalone: delMany still batches into MULTI', async () => {
    const { client, provider } = v3(false);
    client.seed(qualified);
    await provider.delMany(KEYS);

    const multis = client.issued.filter((c) => c.cmd === 'multi');
    assert.strictEqual(multis.length, 1, 'expected a single batched MULTI');
    assert.strictEqual(multis[0].queued[0].keys.length, KEYS.length);
  });

  console.log(`redis cluster safety - ${results.length} checks\n`);
  for (const [ok, name, detail] of results) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n          ${detail}` : ''}`);
  }

  const failed = results.filter(([ok]) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
})();
