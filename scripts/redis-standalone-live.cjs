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

  // An entry that expires is removed by Redis, but its tracking-set member is
  // not: @keyv/redis only SREMs on an explicit delete, and the set itself has
  // no lifetime. keys() reported the dead entry - cacheStats counted it - and
  // the set grew without bound.
  await check('with redis sets: prune() untracks expired entries', async () => {
    const provider = new RedisCacheProvider(client, {});
    await client.flushdb();
    await provider.set('/api/short', { short: true }, 50);
    await provider.set('/api/long', { long: true }, MAX_AGE);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await provider.prune();
    const listed = await provider.keys();
    assert.deepStrictEqual(listed, ['/api/long'], `keys() returned ${JSON.stringify(listed)}`);
    const tracked = await client.smembers('namespace:keyv');
    assert.deepStrictEqual(tracked, ['keyv:/api/long'], `tracking set holds ${JSON.stringify(tracked)}`);
    assert.deepStrictEqual(await provider.get('/api/long'), { long: true });
  });

  // A cache that is only ever written to - nothing purged, stats never opened
  // - still adds a member per write, so writes have to start the prune too.
  await check('with redis sets: writes start a background prune', async () => {
    await client.flushdb();
    await client.sadd('namespace:keyv', 'keyv:/api/expired');
    const provider = new RedisCacheProvider(client, {});
    await provider.set('/api/written', { written: true }, MAX_AGE);
    for (let i = 0; i < 50 && (await client.scard('namespace:keyv')) > 1; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.deepStrictEqual(await client.smembers('namespace:keyv'), ['keyv:/api/written']);
  });

  // The pass is incremental (SSCAN), so it has to cover a set larger than one
  // page, and members removed mid-scan must not make it skip live ones.
  await check('with redis sets: prune() covers a set larger than one batch', async () => {
    const provider = new RedisCacheProvider(client, {});
    await client.flushdb();
    const live = Array.from({ length: 1500 }, (_, i) => `/api/live?page=${i}&`);
    const dead = Array.from({ length: 1500 }, (_, i) => `keyv:/api/dead?page=${i}&`);
    for (const key of live) await provider.set(key, { key }, MAX_AGE);
    await client.sadd('namespace:keyv', ...dead);
    await provider.prune();
    assert.deepStrictEqual((await provider.keys()).sort(), [...live].sort());
  });

  // The prune checks a member with EXISTS and then SREMs it. A response cached
  // for that key in between - SET and SADD, in @keyv/redis' MULTI - is removed
  // from the set by that SREM, and only the re-check after it puts it back.
  // Without it the entry is live and invisible to every purge until maxAge.
  // The write is injected exactly in that window, through a client that runs
  // it just before forwarding the prune's SREM.
  const racing = (onSrem) =>
    new Proxy(client, {
      get(target, prop) {
        if (prop === 'srem') {
          return async (...args) => {
            const hook = onSrem.shift();
            if (hook) await hook();
            return target.srem(...args);
          };
        }
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

  await check('with redis sets: prune() re-tracks an entry written while it ran', async () => {
    await client.flushdb();
    const hooks = [];
    const provider = new RedisCacheProvider(racing(hooks), {});
    await provider.set('/api/raced', { stale: true }, 50);
    await new Promise((resolve) => setTimeout(resolve, 150));
    hooks.push(() => provider.set('/api/raced', { fresh: true }, MAX_AGE));
    await provider.prune();
    assert.strictEqual(hooks.length, 0, 'the write was never injected - the prune issued no SREM');
    assert.deepStrictEqual(await provider.get('/api/raced'), { fresh: true });
    assert.deepStrictEqual(await provider.keys(), ['/api/raced'], 'a live entry was left untracked');
  });

  // If the re-check itself fails, the prune cannot tell whether a write landed
  // after its first check, so it must put back everything it removed.
  await check('with redis sets: a failed re-check leaves nothing live untracked', async () => {
    await client.flushdb();
    const hooks = [];
    const proxied = racing(hooks);
    const provider = new RedisCacheProvider(proxied, {});
    await provider.set('/api/raced', { stale: true }, 50);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const pipeline = client.pipeline.bind(client);
    hooks.push(async () => {
      await provider.set('/api/raced', { fresh: true }, MAX_AGE);
      // Every pipeline from here on - the re-check - fails as a whole.
      client.pipeline = () => {
        const p = pipeline();
        p.exec = async () => {
          throw new Error('connection lost');
        };
        return p;
      };
    });
    try {
      await provider.prune();
    } finally {
      client.pipeline = pipeline;
    }
    assert.deepStrictEqual(await provider.keys(), ['/api/raced'], 'a live entry was left untracked');
  });

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
