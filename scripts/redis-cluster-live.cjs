#!/usr/bin/env node
'use strict';

/**
 * Drives the redis provider against a real Redis Cluster.
 *
 * redis-cluster-check.cjs proves which commands the provider issues, using a
 * recording client. That cannot see a failure inside a dependency: @keyv/redis
 * writes an entry and its tracking-set member in one MULTI, two keys in
 * different hash slots, which a cluster refuses with
 *
 *   All keys in the pipeline should belong to the same slots allocation group
 *
 * Keyv catches that and emits it as an event, so set() reported success and
 * nothing was ever cached on a cluster. Only a real cluster shows it.
 *
 * Needs a cluster to write to: REDIS_CLUSTER_NODES, comma-separated host:port
 * (default 127.0.0.1:7000,127.0.0.1:7001,127.0.0.1:7002).
 *
 * @see https://github.com/strapi-community/plugin-rest-cache/issues/100
 */

const assert = require('assert');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.join(__dirname, '..');
const PROVIDER = path.join(ROOT, 'packages/provider-rest-cache-redis');
const requireFromProvider = createRequire(path.join(PROVIDER, 'package.json'));
// The ioredis the provider actually runs on is @keyv/redis's.
const Redis = createRequire(requireFromProvider.resolve('@keyv/redis'))('ioredis');
// The node-redis plugin-redis v3 hands over as `.native`.
const { createCluster } = requireFromProvider('@redis/client');
const { RedisCacheProvider } = require(path.join(PROVIDER, 'dist/RedisCacheProvider.js'));

const NODES = (process.env.REDIS_CLUSTER_NODES || '127.0.0.1:7000,127.0.0.1:7001,127.0.0.1:7002')
  .split(',')
  .map((node) => {
    const [host, port] = node.split(':');
    return { host, port: Number(port) };
  });

// Spread across hash slots, as request paths are.
const KEYS = Array.from({ length: 30 }, (_, i) => `/api/articles?page=${i}&`);
const MAX_AGE = 600000;

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push([true, name, '']);
  } catch (error) {
    results.push([false, name, error.message.split('\n')[0]]);
  }
}

async function flushAll(cluster) {
  await Promise.all(cluster.nodes('master').map((node) => node.flushdb()));
}

/** Every key on every master. */
async function allKeys(cluster) {
  const per = await Promise.all(cluster.nodes('master').map((node) => node.keys('*')));
  return per.flat().sort();
}

/**
 * The two ways the provider runs: on plugin-redis v2's ioredis client through
 * @keyv/redis, and on plugin-redis v3's node-redis client through
 * NodeRedisStore, constructed the way init() does on v3 - with `null` standing
 * for v3's ioredis shim, which that path must never touch. Every check below
 * runs against both. See
 * https://github.com/strapi-community/plugin-rest-cache/pull/239
 */
const BACKENDS = [
  {
    label: '',
    async connect() {
      const client = new Redis.Cluster(NODES);
      await new Promise((resolve, reject) => {
        client.once('ready', resolve);
        client.once('error', reject);
      });
      return client;
    },
    make: (client, options) => new RedisCacheProvider(client, options),
    // What a write, a delete or a prune issues, by this client's names.
    commands: ['set', 'sadd', 'srem', 'unlink', 'exists', 'sscan'],
    close: (client) => client.disconnect(),
  },
  {
    label: 'v3 ',
    async connect() {
      const client = createCluster({
        rootNodes: NODES.map(({ host, port }) => ({ url: `redis://${host}:${port}` })),
      });
      await client.connect();
      return client;
    },
    make: (client, options) =>
      new RedisCacheProvider(null, options, { client: () => client, isCluster: true }),
    commands: ['set', 'sAdd', 'sRem', 'unlink', 'exists', 'sScan'],
    close: (client) => client.close(),
  },
];

/**
 * Its own cluster connection, with a few milliseconds of jitter on every
 * command a write, a delete or a prune issues - as a busy network would add.
 * Locally a round trip is far shorter than the gaps the races below need.
 */
async function jittered(backend) {
  const client = await backend.connect();
  for (const command of backend.commands) {
    const send = client[command].bind(client);
    client[command] = async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 3));
      return send(...args);
    };
  }
  return client;
}

/** Every check, against one backend. `cluster` is an ioredis client for raw access. */
async function suite(backend, cluster) {
  const { label } = backend;
  const own = await backend.connect();
  const provider = backend.make(own, {});
  // Keyv reports store failures as events, not rejections. Collect them, so a
  // swallowed CROSSSLOT fails a check instead of passing it.
  const storeErrors = [];
  provider.cache.stores[0].on('error', (error) => storeErrors.push(error.message));
  const noStoreErrors = () =>
    assert.deepStrictEqual(storeErrors.splice(0), [], 'the store reported an error');

  /** Live entries keys() does not list, which no purge can reach. */
  const unseenByKeys = async () => {
    const listed = new Set(await provider.keys());
    return (await allKeys(cluster))
      .filter((key) => key.startsWith('keyv:'))
      .map((key) => key.slice('keyv:'.length))
      .filter((key) => !listed.has(key));
  };

  await check(`${label}set() stores entries that get() returns`, async () => {
    await flushAll(cluster);
    for (const key of KEYS) await provider.set(key, { key }, MAX_AGE);
    noStoreErrors();
    for (const key of KEYS) assert.deepStrictEqual(await provider.get(key), { key }, key);
  });

  await check(`${label}set() tracks every entry, with its lifetime`, async () => {
    const tracked = (await cluster.smembers('namespace:keyv')).sort();
    assert.deepStrictEqual(tracked, KEYS.map((k) => `keyv:${k}`).sort());
    const ttl = await cluster.pttl(`keyv:${KEYS[0]}`);
    assert.ok(ttl > MAX_AGE - 10000 && ttl <= MAX_AGE, `lifetime ${ttl}ms is not maxAge`);
  });

  await check(`${label}keys() lists every entry`, async () => {
    assert.deepStrictEqual((await provider.keys()).sort(), [...KEYS].sort());
  });

  await check(`${label}del() removes the entry and its tracking`, async () => {
    await provider.del(KEYS[0]);
    noStoreErrors();
    assert.ok((await provider.get(KEYS[0])) == null, 'entry survived del()');
    assert.strictEqual(await cluster.sismember('namespace:keyv', `keyv:${KEYS[0]}`), 0);
  });

  await check(`${label}delMany() removes entries across slots`, async () => {
    await provider.delMany(KEYS.slice(1, 15));
    noStoreErrors();
    for (const key of KEYS.slice(1, 15)) {
      assert.ok((await provider.get(key)) == null, `${key} survived delMany()`);
    }
    assert.deepStrictEqual((await provider.keys()).sort(), KEYS.slice(15).sort());
  });

  await check(`${label}clear() empties the cluster`, async () => {
    await provider.clear();
    noStoreErrors();
    assert.deepStrictEqual(await allKeys(cluster), []);
  });

  // A purge racing a response being cached for the same key. On a cluster
  // neither is one MULTI, so they interleave. With the purge unlinking first,
  // UNLINK (purge) -> SET, SADD (write) -> SREM (purge) left a live entry
  // missing from the tracking set: invisible to keys(), so no later purge could
  // find it and it was served stale until maxAge. Every live entry must stay
  // reachable through keys().
  await check(`${label}delMany() racing set() never leaves a live entry keys() cannot see`, async () => {
    await flushAll(cluster);
    const keys = Array.from({ length: 200 }, (_, i) => `/api/articles?page=${i}&`);
    for (let round = 0; round < 20; round++) {
      await Promise.all(keys.map((key) => provider.set(key, 'old', MAX_AGE)));
      await Promise.all([
        provider.delMany(keys),
        ...keys.map((key) => provider.set(key, 'new', MAX_AGE)),
      ]);
    }
    noStoreErrors();
    const unseen = await unseenByKeys();
    assert.deepStrictEqual(unseen.length, 0, `${unseen.length} live entries missing from keys(), e.g. ${unseen[0]}`);
  });

  // The same race through del(), which goes through the cluster-safe delete.
  // Locally a round trip is far shorter than the gap between a delete's two
  // commands on a loaded network, so the race almost never shows. Here the
  // deleting and the writing instance each get their own connection and a few
  // milliseconds of jitter per command, as a busy network would add.
  await check(`${label}del() racing set() never leaves a live entry keys() cannot see`, async () => {
    await flushAll(cluster);
    const clients = [await jittered(backend), await jittered(backend)];
    const [deleter, writer] = clients.map((client) => {
      const instance = backend.make(client, {});
      instance.cache.stores[0].on('error', (error) => storeErrors.push(error.message));
      return instance;
    });
    try {
      const keys = Array.from({ length: 200 }, (_, i) => `/api/articles?page=${i}&`);
      for (let round = 0; round < 20; round++) {
        await Promise.all(keys.map((key) => provider.set(key, 'old', MAX_AGE)));
        await Promise.all(
          keys.flatMap((key) => [deleter.del(key), writer.set(key, 'new', MAX_AGE)])
        );
      }
    } finally {
      await Promise.all(clients.map((client) => backend.close(client)));
    }
    noStoreErrors();
    const unseen = await unseenByKeys();
    assert.deepStrictEqual(unseen.length, 0, `${unseen.length} live entries missing from keys(), e.g. ${unseen[0]}`);
  });

  // An entry that expires is removed by Redis, but its tracking-set member is
  // not: @keyv/redis only SREMs on an explicit delete, and the set itself has
  // no lifetime. keys() reported the dead entry, and the set grew forever.
  // keys() lists what the set holds; the prune is what removes such members.
  await check(`${label}prune() untracks expired entries`, async () => {
    await flushAll(cluster);
    await provider.set('/api/short', { short: true }, 50);
    await provider.set('/api/long', { long: true }, MAX_AGE);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await provider.prune();
    const listed = await provider.keys();
    assert.deepStrictEqual(listed, ['/api/long'], `keys() returned ${JSON.stringify(listed)}`);
    const tracked = await cluster.smembers('namespace:keyv');
    assert.deepStrictEqual(tracked, ['keyv:/api/long'], `tracking set holds ${JSON.stringify(tracked)}`);
    assert.deepStrictEqual(await provider.get('/api/long'), { long: true });
  });

  // The pass is incremental (SSCAN), so it has to follow the cursor past the
  // first batch - on a cluster through whatever routing the client does for a
  // keyed SSCAN.
  await check(`${label}prune() covers a set larger than one batch`, async () => {
    await flushAll(cluster);
    const live = Array.from({ length: 1500 }, (_, i) => `/api/live?page=${i}&`);
    const dead = Array.from({ length: 1500 }, (_, i) => `keyv:/api/dead?page=${i}&`);
    await Promise.all(live.map((key) => provider.set(key, { key }, MAX_AGE)));
    await cluster.sadd('namespace:keyv', ...dead);
    await provider.prune();
    assert.deepStrictEqual((await provider.keys()).sort(), [...live].sort());
  });

  // The prune checks a member, SREMs it if its entry is gone, then checks
  // again and re-adds any that came back. A response cached for that key
  // between the first check and the SREM is untracked by the SREM, and only the
  // re-check keeps it findable by purges. Responses here are cached for keys
  // whose entries have expired - exactly the members a prune removes - while
  // it runs.
  await check(`${label}prune() racing set() never leaves a live entry keys() cannot see`, async () => {
    await flushAll(cluster);
    const clients = [await jittered(backend), await jittered(backend)];
    const [pruner, writer] = clients.map((client) => {
      const instance = backend.make(client, {});
      instance.cache.stores[0].on('error', (error) => storeErrors.push(error.message));
      return instance;
    });
    // Expired entries nobody writes again. A prune that does nothing would
    // pass the race check below trivially, since every write tracks its own
    // entry, so these have to be seen untracked.
    const gone = Array.from({ length: 20 }, (_, i) => `keyv:/api/gone?page=${i}&`);
    let leftTracked = 0;
    try {
      const keys = Array.from({ length: 300 }, (_, i) => `/api/articles?page=${i}&`);
      for (let round = 0; round < 10; round++) {
        await flushAll(cluster);
        // Tracked, with nothing behind them: entries that have expired.
        await cluster.sadd('namespace:keyv', ...keys.map((key) => `keyv:${key}`), ...gone);
        // Writes spread over the few milliseconds the prune spends between
        // its check and its SREM, rather than all landing before the check.
        const later = (key) =>
          new Promise((resolve) => setTimeout(resolve, Math.random() * 10)).then(() =>
            writer.set(key, 'new', MAX_AGE)
          );
        await Promise.all([pruner.prune(), ...keys.map(later)]);
        await writer.prune();
        const tracked = new Set(await cluster.smembers('namespace:keyv'));
        leftTracked += gone.filter((member) => tracked.has(member)).length;
      }
    } finally {
      await Promise.all(clients.map((client) => backend.close(client)));
    }
    noStoreErrors();
    assert.strictEqual(leftTracked, 0, `${leftTracked} expired members were never untracked`);
    const unseen = await unseenByKeys();
    assert.deepStrictEqual(unseen.length, 0, `${unseen.length} live entries missing from keys(), e.g. ${unseen[0]}`);
  });

  // Without redis sets there is no tracking set to read, so keys() has to find
  // entries itself - on every master, since SCAN only sees the node it is sent
  // to. Reading one node, or the empty set, made pattern purges match nothing.
  const unset = backend.make(own, { useRedisSets: false });
  unset.cache.stores[0].on('error', (error) => storeErrors.push(error.message));

  await check(`${label}without redis sets: keys() finds entries on every master`, async () => {
    await flushAll(cluster);
    for (const key of KEYS) await unset.set(key, { key }, MAX_AGE);
    noStoreErrors();
    const populated = (
      await Promise.all(cluster.nodes('master').map((node) => node.dbsize()))
    ).filter((size) => size > 0).length;
    assert.ok(populated > 1, 'entries did not spread across masters');
    assert.deepStrictEqual((await unset.keys()).sort(), [...KEYS].sort());
  });

  await check(`${label}without redis sets: purging what keys() lists removes it`, async () => {
    await unset.delMany(await unset.keys());
    noStoreErrors();
    assert.deepStrictEqual(await allKeys(cluster), []);
  });

  await check(`${label}without redis sets: clear() empties every master`, async () => {
    await flushAll(cluster);
    for (const key of KEYS) await unset.set(key, { key }, MAX_AGE);
    await unset.clear();
    noStoreErrors();
    assert.deepStrictEqual(await allKeys(cluster), []);
  });

  await backend.close(own);
}

(async () => {
  const cluster = new Redis.Cluster(NODES);
  await new Promise((resolve, reject) => {
    cluster.once('ready', resolve);
    cluster.once('error', reject);
  });

  for (const backend of BACKENDS) await suite(backend, cluster);

  await flushAll(cluster);
  cluster.disconnect();

  console.log(`redis cluster (live) - ${NODES.length} nodes\n`);
  for (const [ok, name, detail] of results) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n          ${detail}` : ''}`);
  }
  const failed = results.filter(([ok]) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
