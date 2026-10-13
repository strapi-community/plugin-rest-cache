#!/usr/bin/env node
'use strict';

/**
 * Drives the redis provider against a real standalone Redis, for behaviour the
 * e2e suite cannot reach because the playground uses one fixed configuration.
 *
 * Needs a Redis it may flush: REDIS_URL (default redis://127.0.0.1:6379/15).
 */

const assert = require('assert');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.join(__dirname, '..');
const PROVIDER = path.join(ROOT, 'packages/provider-rest-cache-redis');
const requireFromProvider = createRequire(path.join(PROVIDER, 'package.json'));
// The ioredis the provider actually runs on is @keyv/redis's.
const Redis = createRequire(requireFromProvider.resolve('@keyv/redis'))('ioredis');
const { RedisCacheProvider } = require(path.join(PROVIDER, 'dist/RedisCacheProvider.js'));

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379/15';
const KEYS = ['/api/articles?', '/api/articles/1?populate=*', '/api/categories?locale=fr'];
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

(async () => {
  const client = new Redis(REDIS_URL);

  // With useRedisSets off, @keyv/redis keeps no tracking set and names every
  // entry `sets:namespace:keyv:keyv:<key>`. keys() read the (empty) tracking
  // set anyway and returned nothing, so every pattern purge matched nothing
  // and the entries survived until maxAge.
  for (const options of [{}, { useRedisSets: false }]) {
    const mode = options.useRedisSets === false ? 'without redis sets' : 'with redis sets';
    const provider = new RedisCacheProvider(client, options);

    await check(`${mode}: keys() lists every entry, unqualified`, async () => {
      await client.flushdb();
      for (const key of KEYS) await provider.set(key, { key }, MAX_AGE);
      assert.deepStrictEqual((await provider.keys()).sort(), [...KEYS].sort());
    });

    await check(`${mode}: purging what keys() lists removes it`, async () => {
      const matched = (await provider.keys()).filter((key) => key.startsWith('/api/articles'));
      assert.strictEqual(matched.length, 2, 'pattern matched nothing');
      await provider.delMany(matched);
      assert.deepStrictEqual((await provider.keys()).sort(), ['/api/categories?locale=fr']);
      for (const key of matched) assert.ok((await provider.get(key)) == null, `${key} survived`);
    });
  }

  await client.flushdb();
  await client.quit();

  console.log('redis standalone (live)\n');
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
