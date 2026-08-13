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

(async () => {
  console.log(`provider smoke test - Node ${process.version}\n`);

  await record('memory provider: set/get/keys/del', memoryProvider);
  await record('memory provider: honours maxAge in ms', memoryProviderRespectsTtl);
  await record('redis provider: module loads', redisProviderModuleLoads);

  for (const [ok, name, detail] of results) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n          ${detail}` : ''}`);
  }

  const failed = results.filter(([ok]) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
})();
