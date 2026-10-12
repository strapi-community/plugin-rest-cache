#!/usr/bin/env node
'use strict';

/**
 * Verifies the redis provider's two backends share one storage layout.
 *
 * On @strapi-community/plugin-redis v2 the provider stores entries through
 * @keyv/redis 3 on the plugin's ioredis client. On v3 it uses its own store on
 * the plugin's node-redis client. A deployment that upgrades the redis plugin
 * keeps every entry cached before the upgrade, so the new store has to read
 * them, list them and purge them - otherwise purges after the upgrade miss
 * every older entry until its maxAge runs out. The same has to hold the other
 * way round for a rollback.
 *
 * So this writes with one backend and reads, lists and purges with the other,
 * against a real Redis, and compares the raw keys each one leaves behind.
 *
 * Needs a Redis it may flush: REDIS_URL (default redis://127.0.0.1:6379/15).
 *
 * @see https://github.com/strapi-community/plugin-rest-cache/pull/239
 */

const assert = require('assert');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.join(__dirname, '..');
const PROVIDER = path.join(ROOT, 'packages/provider-rest-cache-redis');
const requireFromProvider = createRequire(path.join(PROVIDER, 'package.json'));

const Redis = requireFromProvider('ioredis');
const { createClient } = requireFromProvider('@redis/client');
const { RedisCacheProvider } = require(path.join(PROVIDER, 'dist/RedisCacheProvider.js'));

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379/15';

const ENTRIES = [
  ['/api/articles?', { data: [{ id: 1 }] }],
  ['/api/articles/1?populate=*', { data: { id: 1, title: 'one' } }],
  ['/api/categories?locale=fr', { data: [] }],
  ['/api/homepage?_etag', 'W/"abc"'],
];
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

/** Every raw key in the database with its type and remaining lifetime. */
async function snapshot(raw) {
  const keys = (await raw.keys('*')).sort();
  const out = [];
  for (const key of keys) {
    const type = await raw.type(key);
    const ttl = await raw.pttl(key);
    const members = type === 'set' ? (await raw.smembers(key)).sort() : undefined;
    // Lifetimes drift by the time between writes, so compare a band rather
    // than the exact value - but a tight one: maxAge is milliseconds and a
    // unit slip (#126) lands orders of magnitude outside it.
    const lifetime =
      ttl < 0 ? 'none' : ttl <= MAX_AGE && ttl > MAX_AGE - 10000 ? 'maxAge' : `off: ${ttl}ms`;
    out.push({ key, type, lifetime, members });
  }
  return out;
}

(async () => {
  const raw = new Redis(REDIS_URL);
  const io = new Redis(REDIS_URL);
  const node = createClient({ url: REDIS_URL });
  await node.connect();

  // On v3 the provider is handed the plugin's deprecated ioredis shim as well,
  // and keeps it as `provider.client` for anyone typed against it - but must
  // never use it. A shim that throws on any call makes "v3 quietly ran on the
  // v2 path" fail here instead of passing.
  const untouchable = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return undefined;
        throw new Error(`v3 backend touched the ioredis client (.${String(prop)})`);
      },
    }
  );

  const backends = {
    v2: (options) => new RedisCacheProvider(io, options),
    v3: (options) =>
      new RedisCacheProvider(untouchable, options, { client: node, isCluster: false }),
  };

  for (const options of [{}, { useRedisSets: false }]) {
    const mode = options.useRedisSets === false ? 'without redis sets' : 'with redis sets';

    await check(`${mode}: v2 and v3 write byte-identical keys`, async () => {
      const layouts = {};
      for (const [name, make] of Object.entries(backends)) {
        await raw.flushdb();
        const provider = make(options);
        for (const [key, value] of ENTRIES) await provider.set(key, value, MAX_AGE);
        layouts[name] = await snapshot(raw);
      }
      assert.ok(layouts.v2.length > 0, 'v2 wrote nothing');
      assert.deepStrictEqual(layouts.v3, layouts.v2);
    });

    for (const [writer, reader] of [
      ['v2', 'v3'],
      ['v3', 'v2'],
    ]) {
      await check(`${mode}: ${reader} reads and purges what ${writer} wrote`, async () => {
        await raw.flushdb();
        const before = backends[writer](options);
        for (const [key, value] of ENTRIES) await before.set(key, value, MAX_AGE);

        const after = backends[reader](options);
        for (const [key, value] of ENTRIES) {
          assert.deepStrictEqual(await after.get(key), value, `get(${key})`);
        }

        // keys() is what pattern purges match against. Without redis sets
        // neither backend can enumerate (the layout predates this provider);
        // that is the existing behaviour, so it only has to agree.
        const listed = (await after.keys()).sort();
        const expected = (await before.keys()).sort();
        assert.deepStrictEqual(listed, expected, 'keys() differs between backends');

        await after.delMany(ENTRIES.map(([key]) => key));
        for (const [key] of ENTRIES) {
          assert.ok((await before.get(key)) == null, `${key} survived the purge`);
        }
        const left = (await raw.keys('*')).filter((k) => !k.startsWith('namespace:'));
        assert.deepStrictEqual(left, [], 'purge left entries behind');
        if (options.useRedisSets !== false) {
          assert.strictEqual(await raw.scard('namespace:keyv'), 0, 'tracking set not emptied');
        }
      });
    }

    await check(`${mode}: v3 clear() empties what v2 wrote`, async () => {
      await raw.flushdb();
      const before = backends.v2(options);
      for (const [key, value] of ENTRIES) await before.set(key, value, MAX_AGE);

      await backends.v3(options).clear();

      assert.deepStrictEqual(await raw.keys('*'), []);
    });
  }

  await check('v3 never closes the shared client', async () => {
    const provider = backends.v3({});
    await provider.set('/api/x', 1, MAX_AGE);
    await provider.cache.disconnect();
    assert.strictEqual(node.isReady, true, 'the node-redis client was closed');
    assert.strictEqual(await node.ping(), 'PONG');
  });

  await check('v3 reports ready from the node-redis client', async () => {
    assert.strictEqual(backends.v3({}).ready, true);
  });

  await raw.flushdb();
  await Promise.all([raw.quit(), io.quit(), node.close()]);

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
