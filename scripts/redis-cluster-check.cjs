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
  path.join(ROOT, 'packages/provider-rest-cache-redis/lib/RedisCacheProvider.js')
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

  console.log(`redis cluster safety - ${results.length} checks\n`);
  for (const [ok, name, detail] of results) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n          ${detail}` : ''}`);
  }

  const failed = results.filter(([ok]) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
})();
