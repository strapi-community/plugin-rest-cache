#!/usr/bin/env node
'use strict';

/**
 * Standalone provider smoke test.
 *
 * Exercises the cache providers WITHOUT booting Strapi, so it can run on any
 * Node version. This matters: Strapi 5.52.0 cannot be installed below Node
 * 22.13 (@strapi/utils pins preferred-pm@5.0.0), so the e2e suite can never
 * reach the Node versions where the providers actually fail to load.
 *
 * That blind spot is why the ERR_REQUIRE_ESM / "Keyv is not a constructor"
 * failures in #118, #123 and #116 survived a green CI for so long.
 *
 * Usage: node scripts/provider-smoke.cjs
 */

const assert = require('assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const results = [];

function record(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      results.push([true, name, '']);
    })
    .catch((error) => {
      results.push([false, name, `${error.code ? `${error.code}: ` : ''}${error.message.split('\n')[0]}`]);
    });
}

async function memoryProvider() {
  const provider = require(path.join(ROOT, 'packages/provider-rest-cache-memory/dist/index.js'));

  const instance = await provider.init({ maxSize: 100 });

  await instance.set('alpha', { hello: 'world' }, 60000);
  await instance.set('beta', { hello: 'there' }, 60000);

  const value = await instance.get('alpha');
  assert.deepStrictEqual(value, { hello: 'world' }, 'get() should round-trip the stored value');

  // keys() backs reset() and clearByRegexp(), i.e. all cache invalidation.
  // quick-lru 5.x silently lacks the iterator this depends on.
  const keys = await instance.keys();
  assert.ok(Array.isArray(keys), 'keys() should return an array');
  assert.deepStrictEqual(keys.sort(), ['alpha', 'beta'], 'keys() should list every stored key');

  await instance.del('alpha');
  assert.ok((await instance.get('alpha')) == null, 'del() should remove the entry');

  assert.strictEqual(instance.ready, true, 'provider should report ready');
}

async function memoryProviderRespectsTtl() {
  const provider = require(path.join(ROOT, 'packages/provider-rest-cache-memory/dist/index.js'));
  const instance = await provider.init({ maxSize: 100 });

  // maxAge is milliseconds. Regression guard for #126, where both providers
  // multiplied it by 1000 again and turned 1 hour into 41.7 days.
  await instance.set('shortlived', 'value', 150);
  assert.strictEqual(await instance.get('shortlived'), 'value', 'entry should exist before expiry');

  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.ok((await instance.get('shortlived')) == null, 'entry should expire after maxAge ms');
}

async function redisProviderModuleLoads() {
  // The redis provider needs a live connection to init(), but the reported
  // failures happen at require() time, which is what we can check anywhere.
  const provider = require(path.join(ROOT, 'packages/provider-rest-cache-redis/dist/index.js'));
  assert.strictEqual(provider.provider, 'redis');
  assert.strictEqual(typeof provider.init, 'function');

  const { RedisCacheProvider } = require(
    path.join(ROOT, 'packages/provider-rest-cache-redis/dist/RedisCacheProvider.js')
  );
  assert.strictEqual(typeof RedisCacheProvider, 'function');
}

/**
 * The redis provider runs on plugin-redis v3's node-redis connection when v3 is
 * installed, and on v2's ioredis client otherwise. Neither path needs a server
 * to choose; these drive init() against stand-ins for each plugin version.
 * See https://github.com/strapi-community/plugin-rest-cache/pull/239
 */
function redisProviderModule() {
  return {
    provider: require(path.join(ROOT, 'packages/provider-rest-cache-redis/dist/index.js')),
    ...require(path.join(ROOT, 'packages/provider-rest-cache-redis/dist/NodeRedisStore.js')),
  };
}

const quietStrapi = (extra) => ({ log: { info() {}, warn() {} }, ...extra });

/** An ioredis client that must never be used. */
const untouchable = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'then') return undefined;
      throw new Error(`touched the ioredis client (.${String(prop)})`);
    },
  }
);

function v3Strapi({ whenReady }) {
  return quietStrapi({
    redis: { connections: {} },
    plugin: (name) =>
      name === 'redis'
        ? { service: (svc) => (svc === 'connection' ? { whenReady } : undefined) }
        : undefined,
  });
}

async function redisProviderUsesV3Native() {
  const { provider, NodeRedisStore } = redisProviderModule();
  const native = { isReady: true };
  const asked = [];
  const strapi = v3Strapi({
    whenReady: async (name) => {
      asked.push(name);
      return { client: untouchable, native, type: 'standalone', ready: true };
    },
  });

  const instance = await provider.init({ connection: 'cache' }, { strapi });
  const store = instance.cache.stores[0].opts.store;

  assert.deepStrictEqual(asked, ['cache'], 'should wait on the configured connection');
  assert.ok(store instanceof NodeRedisStore, 'v3 should run on NodeRedisStore');
  assert.strictEqual(store.client, native, 'v3 should use connections[name].native');
  assert.strictEqual(store.isCluster, false);
  assert.strictEqual(instance.ready, true);
}

async function redisProviderDetectsV3Cluster() {
  const { provider } = redisProviderModule();
  const strapi = v3Strapi({
    whenReady: async () => ({ client: untouchable, native: { isReady: true }, type: 'cluster' }),
  });

  const instance = await provider.init({}, { strapi });
  assert.strictEqual(instance.cache.stores[0].opts.store.isCluster, true);
}

async function redisProviderReportsV3Failure() {
  const { provider } = redisProviderModule();
  const strapi = v3Strapi({
    whenReady: async () => {
      throw new Error('connection "default" failed: ECONNREFUSED');
    },
  });

  await assert.rejects(provider.init({}, { strapi }), (error) => {
    assert.match(error.message, /Could not initialize REST Cache provider "redis"/);
    assert.match(error.message, /ECONNREFUSED/);
    return true;
  });
}

async function redisProviderKeepsV2Path() {
  const { provider, NodeRedisStore } = redisProviderModule();
  const listeners = {};
  const client = {
    status: 'ready',
    options: { family: 4 },
    on(event, fn) {
      (listeners[event] ||= []).push(fn);
    },
    once() {},
    off() {},
  };
  // plugin-redis v2 registers no "connection" service.
  const strapi = quietStrapi({
    redis: { connections: { default: { client } } },
    plugin: (name) => (name === 'redis' ? { service: () => undefined } : undefined),
  });

  // The v2 path logs through the global, as it always has.
  global.strapi = strapi;
  let instance;
  try {
    instance = await provider.init({}, { strapi });
  } finally {
    delete global.strapi;
  }
  const store = instance.cache.stores[0].opts.store;

  assert.ok(!(store instanceof NodeRedisStore), 'v2 should stay on @keyv/redis');
  assert.strictEqual(store.redis, client, 'v2 should use connections[name].client');
}

(async () => {
  console.log(`provider smoke test - Node ${process.version}\n`);

  await record('memory provider: set/get/keys/del', memoryProvider);
  await record('memory provider: honours maxAge in ms', memoryProviderRespectsTtl);
  await record('redis provider: module loads', redisProviderModuleLoads);
  await record('redis provider: uses plugin-redis v3 native client', redisProviderUsesV3Native);
  await record('redis provider: detects a v3 cluster from .type', redisProviderDetectsV3Cluster);
  await record('redis provider: reports a v3 connection failure', redisProviderReportsV3Failure);
  await record('redis provider: keeps the plugin-redis v2 path', redisProviderKeepsV2Path);

  for (const [ok, name, detail] of results) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n          ${detail}` : ''}`);
  }

  const failed = results.filter(([ok]) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
})();
