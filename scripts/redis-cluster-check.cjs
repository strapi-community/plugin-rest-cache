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
const MULTI_KEY = new Set(['unlink', 'del', 'exists', 'mget', 'mset']);

function recordingClient({ isCluster }) {
  const issued = [];
  const members = new Set();
  // The entries themselves, as distinct from the tracking set's members.
  const entries = new Set();

  const client = {
    isCluster,
    issued,
    // Enough of an ioredis client for @keyv/redis' constructor, so del() can
    // run through the real adapter and makeClusterSafe.
    options: {},
    on() {},
    async smembers() {
      return [...members];
    },
    async sscan(_set, cursor, _count, size) {
      // Pages of `size`, cursor = offset: enough to drive a multi-page pass.
      const all = [...members];
      const start = Number(cursor);
      const next = start + Number(size);
      client.issued.push({ cmd: 'sscan', cursor, keys: [] });
      return [next >= all.length ? '0' : String(next), all.slice(start, next)];
    },
    async unlink(...keys) {
      issued.push({ cmd: 'unlink', keys: keys.flat() });
      for (const key of keys.flat()) {
        members.delete(key);
        entries.delete(key);
      }
      return keys.flat().length;
    },
    async exists(...keys) {
      issued.push({ cmd: 'exists', keys: keys.flat() });
      return keys.flat().filter((key) => entries.has(key)).length;
    },
    async srem(_set, ...keys) {
      issued.push({ cmd: 'srem', keys: keys.flat() });
      // Runs before the members are removed: it stands for a write that
      // landed between the prune's check and its SREM, whose SADD the SREM
      // then undoes. Running it after would re-add the member itself, and the
      // tests built on it would pass whatever the prune did.
      if (client.onSrem) client.onSrem();
      for (const key of keys.flat()) members.delete(key);
      return keys.flat().length;
    },
    async sadd(_set, ...keys) {
      issued.push({ cmd: 'sadd', keys: keys.flat() });
      for (const key of keys.flat()) members.add(key);
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
    /** An entry Redis expired: gone, but still a member of the tracking set. */
    expire(key) {
      entries.delete(key);
    },
    seed(keys) {
      for (const key of keys) {
        members.add(key);
        entries.add(key);
      }
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

  // A write is SET then SADD. A purge that unlinks before it untracks can
  // interleave as UNLINK (purge) -> SET, SADD (write) -> SREM (purge), leaving
  // a live entry no later purge can find. Untracking first means the same race
  // leaves at worst a tracked key with nothing behind it, which keys() prunes.
  await check('cluster: delMany untracks before it unlinks', async () => {
    const client = recordingClient({ isCluster: true });
    client.seed(qualified);
    const provider = makeProvider(client);

    await provider.delMany(KEYS);

    const order = client.issued.map((c) => c.cmd);
    const lastSrem = order.lastIndexOf('srem');
    const firstUnlink = order.indexOf('unlink');
    assert.ok(lastSrem !== -1 && firstUnlink !== -1, `unexpected commands: ${order.join(',')}`);
    assert.ok(lastSrem < firstUnlink, 'unlinked an entry before removing it from the tracking set');
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

  // keys() is what every pattern purge runs on, on every content save. It
  // used to check each tracking-set member with EXISTS before answering, which
  // at 100k members turned a 60ms SMEMBERS into seconds. It must answer from
  // SMEMBERS alone, whatever the background prune is doing.
  await check('keys() answers from SMEMBERS without waiting on the prune', async () => {
    const client = recordingClient({ isCluster: true });
    client.seed(qualified);
    client.expire(qualified[0]);
    // A prune that never gets past its first SSCAN.
    client.sscan = () => {
      client.issued.push({ cmd: 'sscan', keys: [] });
      return new Promise(() => {});
    };
    const provider = makeProvider(client);

    // A keys() that waited on the prune would never settle here.
    const keys = await Promise.race([
      provider.keys(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('keys() waited on the prune')), 1000)
      ),
    ]);
    assert.strictEqual(keys.length, KEYS.length, `listed ${keys.length} of ${KEYS.length} members`);
    const exists = client.issued.filter((c) => c.cmd === 'exists');
    assert.strictEqual(exists.length, 0, `keys() issued ${exists.length} EXISTS`);
  });

  // The prune is triggered by keys() and set(), so it has to be rate limited
  // or it would run on every purge anyway, just out of sight.
  await check('keys() starts at most one prune per interval', async () => {
    const client = recordingClient({ isCluster: true });
    client.seed(qualified);
    const provider = makeProvider(client);

    const passes = () => client.issued.filter((c) => c.cmd === 'sscan' && c.cursor === '0').length;
    // Each pass here finishes within a turn of the event loop, so this also
    // checks that a pass that has finished still counts against the interval.
    for (let i = 0; i < 5; i++) {
      await provider.keys();
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.ok(passes() >= 1, 'keys() never started a prune');
    assert.strictEqual(passes(), 1, `keys() started ${passes()} passes`);

    // An explicit prune() runs regardless, and restarts the interval.
    await provider.prune();
    await provider.keys();
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(passes(), 2, `${passes()} passes after an explicit prune()`);
  });

  // A background pass may already have scanned past a member, so prune() must
  // not settle for it: it is what a caller awaits to get an exact set.
  await check('prune() makes a pass of its own after one already running', async () => {
    const client = recordingClient({ isCluster: true });
    client.seed(qualified);
    const sscan = client.sscan;
    let release;
    // The background pass sees an empty first and only page, and waits.
    client.sscan = (...args) => {
      client.sscan = sscan;
      client.issued.push({ cmd: 'sscan', cursor: '0', keys: [] });
      return new Promise((resolve) => {
        release = () => resolve(['0', []]);
      });
    };
    const provider = makeProvider(client);

    await provider.keys();
    client.expire(qualified[0]);
    const pruned = provider.prune();
    release();
    await pruned;
    assert.ok(!(await client.smembers()).includes(qualified[0]), 'prune() reused the stale pass');
  });

  // Expiry removes an entry but not its tracking-set member, so the prune has
  // to check what is still alive - and on a cluster the entries span hash
  // slots, so each EXISTS must address one key.
  await check('cluster: prune() untracks expired entries, checking key by key', async () => {
    const client = recordingClient({ isCluster: true });
    client.seed(qualified);
    client.expire(qualified[0]);
    const provider = makeProvider(client);

    await provider.prune();
    const keys = await provider.keys();
    assert.ok(!keys.includes(KEYS[0]), 'listed an expired entry after a prune');
    assert.strictEqual(keys.length, KEYS.length - 1, `listed ${keys.length} of ${KEYS.length - 1} live entries`);

    const offending = client.issued.filter(
      (c) => MULTI_KEY.has(c.cmd) && c.keys.length > 1
    );
    assert.deepStrictEqual(offending, [], 'the prune issued a multi-key command');
    assert.strictEqual(
      client.issued.some((c) => c.cmd === 'multi'),
      false,
      'used MULTI, which cannot span hash slots'
    );
    assert.ok(
      client.issued.some((c) => c.cmd === 'srem' && c.keys.includes(qualified[0])),
      'the expired entry was not removed from the tracking set'
    );
  });

  // The prune checks a member, then untracks it. A response cached for that
  // key in between - SET then SADD - must not end up untracked, or it is a
  // live entry no purge can find.
  await check('cluster: prune() keeps an entry written while it was being pruned', async () => {
    const client = recordingClient({ isCluster: true });
    client.seed(qualified);
    client.expire(qualified[0]);
    client.onSrem = () => {
      client.onSrem = null;
      client.seed([qualified[0]]);
    };
    const provider = makeProvider(client);

    await provider.prune();
    assert.ok(
      (await client.smembers()).includes(qualified[0]),
      'the rewritten entry was left out of the tracking set'
    );
  });

  // After the SREM, a member is only safe again once the re-check and the
  // re-add have both succeeded. If either fails, the prune cannot know whether
  // a write landed in between, so it has to put every member it removed back
  // - and it must never throw, because it runs behind purges and writes.
  await check('prune() re-tracks what it removed when the re-check fails', async () => {
    const client = recordingClient({ isCluster: true });
    client.seed(qualified);
    client.expire(qualified[0]);
    client.expire(qualified[1]);
    client.onSrem = () => {
      client.onSrem = null;
      client.seed([qualified[0]]);
      client.exists = async () => {
        throw new Error('connection lost');
      };
    };
    const provider = makeProvider(client);

    await provider.prune();
    const tracked = await client.smembers();
    assert.ok(tracked.includes(qualified[0]), 'a possibly-live member was left untracked');
  });

  await check('prune() retries a failed re-add and never throws', async () => {
    const client = recordingClient({ isCluster: true });
    client.seed(qualified);
    client.expire(qualified[0]);
    client.onSrem = () => {
      client.onSrem = null;
      client.seed([qualified[0]]);
    };
    const sadd = client.sadd;
    let failures = 1;
    client.sadd = async (...args) => {
      if (failures-- > 0) throw new Error('connection lost');
      return sadd(...args);
    };
    const provider = makeProvider(client);

    await provider.prune();
    assert.ok(
      (await client.smembers()).includes(qualified[0]),
      'the rewritten entry was left out of the tracking set'
    );
  });

  await check('a prune that fails outright never reaches keys() or prune()', async () => {
    const client = recordingClient({ isCluster: true });
    client.seed(qualified);
    client.sscan = async () => {
      throw new Error('connection lost');
    };
    const provider = makeProvider(client);

    await provider.prune();
    assert.strictEqual((await provider.keys()).length, KEYS.length);
  });

  // makeClusterSafe replaces @keyv/redis' delete(), which provider.del() goes
  // through. It must untrack before it unlinks for the same reason delMany
  // does: UNLINK (delete) -> SET, SADD (write) -> SREM (delete) leaves a live
  // entry outside the tracking set. Asserted on the commands, rather than only
  // by the live race in redis-cluster-live.cjs, which may not hit the window.
  await check('cluster: del() untracks before it unlinks', async () => {
    const client = recordingClient({ isCluster: true });
    client.seed(qualified);
    const provider = new RedisCacheProvider(client, {});

    await provider.del(KEYS[0]);

    const order = client.issued.map((c) => c.cmd).filter((cmd) => cmd === 'srem' || cmd === 'unlink');
    assert.deepStrictEqual(order, ['srem', 'unlink'], `issued ${order.join(' -> ')}`);
    assert.ok(
      client.issued.every((c) => !c.keys.length || c.keys.includes(qualified[0])),
      `addressed the wrong key: ${JSON.stringify(client.issued)}`
    );
    assert.ok(!(await client.smembers()).includes(qualified[0]), 'still tracked after del()');
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
