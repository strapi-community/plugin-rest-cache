import { createCache, type Cache } from 'cache-manager';
import { CacheProvider } from '@strapi-community/plugin-rest-cache/types';
import type { CacheKey, Milliseconds } from '@strapi-community/plugin-rest-cache/types';

// keyv 4 exports the constructor directly, keyv 5 exports it as `.default`, and
// @keyv/redis exposes only `.default` from its CJS build. Accept either shape:
// which one we get depends on what else in the host application's dependency
// tree won the hoist. See
// https://github.com/strapi-community/plugin-rest-cache/issues/128
//
// Loaded through `require` and typed `any` on purpose: the whole reason the
// fallback exists is that the runtime shape is not knowable from the type
// declarations of whichever copy happens to be installed.
const keyvModule: any = require('keyv');
const Keyv = keyvModule.default ?? keyvModule;

const keyvRedisModule: any = require('@keyv/redis');
const KeyvRedis = keyvRedisModule.default ?? keyvRedisModule;

/** A queued MULTI, as ioredis returns it from `multi()`. */
export interface RedisMulti {
  unlink(...keys: string[]): unknown;
  srem(key: string, ...members: string[]): unknown;
  exec(): Promise<unknown>;
}

/**
 * The ioredis client, as `@strapi-community/plugin-redis` hands it over.
 *
 * Described structurally rather than by importing ioredis' types: the
 * connection - and therefore the ioredis version - belongs to the redis plugin,
 * and depending on ioredis here only to name its client type would invite this
 * package to resolve a different copy than the client actually came from.
 *
 * Only the members this provider touches are listed.
 */
export interface RedisClient {
  status: string;
  isCluster?: boolean;
  on(event: string, listener: (...args: any[]) => void): unknown;
  off(event: string, listener: (...args: any[]) => void): unknown;
  once(event: string, listener: (...args: any[]) => void): unknown;
  smembers(key: string): Promise<string[]>;
  unlink(...keys: string[]): Promise<unknown>;
  srem(key: string, ...members: string[]): Promise<unknown>;
  multi(): RedisMulti;
}

/**
 * The parts of @keyv/redis this provider reaches into.
 *
 * These are the adapter's internals, not its public surface - the batching,
 * cluster handling and key enumeration below all need the raw client or the
 * key-tracking set, and the adapter exposes neither. Every use is guarded at
 * runtime so an adapter without them falls back to the portable path.
 */
interface KeyvRedisStore {
  redis?: RedisClient;
  namespace?: string;
  opts?: Record<string, unknown>;
  _getNamespace?(): string | undefined;
}

/**
 * The store the cache was built on, seen as the @keyv/redis adapter.
 *
 * A free function rather than a method so the class keeps exactly the shape it
 * had as JavaScript - the plugin freezes the instance it gets back and
 * identifies it by walking the constructor chain.
 */
const redisStoreOf = (cache: Cache): KeyvRedisStore =>
  cache.stores[0].opts.store as unknown as KeyvRedisStore;

/** Everything accepted under `provider.options` in the plugin configuration. */
export interface RedisCacheProviderOptions {
  /** Name of a connection declared on the redis plugin. */
  connection?: string;
  /** Store-level default lifetime, in milliseconds. */
  ttl?: Milliseconds | number;
  [option: string]: unknown;
}

export class RedisCacheProvider extends CacheProvider {
  readonly client: RedisClient;

  private readonly cache: Cache;

  constructor(client: RedisClient, options: RedisCacheProviderOptions) {
    super();

    const { ttl, ...adapterOptions } = options;

    this.client = client;
    this.cache = createCache({
      ttl,
      stores: [
        new Keyv({
          store: new KeyvRedis(client, adapterOptions),
        }),
      ],
    });
  }

  async get(key: CacheKey | string): Promise<unknown> {
    return this.cache.get(key);
  }

  /**
   * @param maxAge in milliseconds
   */
  async set(
    key: CacheKey | string,
    val: unknown,
    maxAge: Milliseconds | number = 3600000
  ): Promise<unknown> {
    // cache-manager's set() takes a ttl in milliseconds and maxAge is already
    // in milliseconds - do not convert.
    return this.cache.set(key, val, maxAge);
  }

  async del(key: CacheKey | string | string[]): Promise<unknown> {
    return this.cache.del(key as string);
  }

  async delMany(keys: Array<CacheKey | string>): Promise<void> {
    if (!keys.length) return;

    const store = redisStoreOf(this.cache);
    const namespace = store._getNamespace?.();

    // @keyv/redis's own deleteMany maps over delete(), issuing a MULTI of
    // UNLINK + SREM per key, all in flight at once. Sending one MULTI for the
    // whole batch turns a round trip per key into a round trip per chunk.
    if (store.redis && namespace && store.namespace && store.opts?.useRedisSets !== false) {
      const qualified = keys.map((key) => `${store.namespace}:${key}`);

      // In cluster mode the cache keys are spread across hash slots, and a
      // multi-key UNLINK - or a MULTI spanning them - is rejected outright:
      //
      //   CROSSSLOT Keys in request don't hash to the same slot
      //
      // So delete them individually and let the cluster client route each one.
      // The tracking set is a single key, so a variadic SREM against it is
      // still safe and can stay batched.
      //
      // See https://github.com/strapi-community/plugin-rest-cache/issues/100
      if (store.redis.isCluster) {
        const CONCURRENCY = 16;

        for (let i = 0; i < qualified.length; i += CONCURRENCY) {
          const batch = qualified.slice(i, i + CONCURRENCY);
          await Promise.all(batch.map((key) => store.redis.unlink(key)));
        }

        const SREM_CHUNK = 1000;
        for (let i = 0; i < qualified.length; i += SREM_CHUNK) {
          await store.redis.srem(namespace, ...qualified.slice(i, i + SREM_CHUNK));
        }

        return;
      }

      // Chunked so a large purge does not build a single enormous command.
      const CHUNK = 1000;

      for (let i = 0; i < qualified.length; i += CHUNK) {
        const batch = qualified.slice(i, i + CHUNK);
        const trx = store.redis.multi();
        trx.unlink(...batch);
        trx.srem(namespace, ...batch);
        await trx.exec();
      }

      return;
    }

    await this.cache.mdel(keys as string[]);
  }

  async keys(): Promise<string[]> {
    // @keyv/redis maintains a set of every key it has written (it SADDs on
    // write and SREMs on delete), so the key names can be read directly.
    //
    // The obvious alternative - iterating the keyv store - is what this used to
    // do, and it is enormously more expensive: it SCANs the whole Redis
    // keyspace at ioredis' default COUNT of 10, and MGETs a batch of *values*
    // for every page, purely to enumerate names. Measured over 100k entries
    // that was roughly 20,000 round trips and 55MB transferred, against 1 round
    // trip here.
    //
    // See https://github.com/strapi-community/plugin-rest-cache/issues/131
    const store = redisStoreOf(this.cache);
    const namespace = store._getNamespace?.();

    if (typeof store.redis?.smembers === 'function' && namespace && store.namespace) {
      const members = await store.redis.smembers(namespace);

      // The tracking set holds fully qualified redis keys ("keyv:/api/foo"),
      // whereas the iterator - and therefore every caller of this method -
      // yields them unqualified ("/api/foo"). Returning the qualified form
      // silently breaks purging: the regexes never match and the deletes
      // address keys that do not exist.
      const prefix = `${store.namespace}:`;
      return members.map((key) => (key.startsWith(prefix) ? key.slice(prefix.length) : key));
    }

    // Fall back to enumeration only if the adapter does not maintain a key set
    // (useRedisSets disabled).
    //
    // Note this fallback is itself the original cluster bug: SCAN addresses a
    // single node, so on a cluster it returns whichever portion of the keyspace
    // that node happens to hold and the purge silently misses the rest. Reading
    // the tracking set above avoids that entirely, because the set is one key
    // and therefore complete.
    //
    // See https://github.com/strapi-community/plugin-rest-cache/issues/100
    const keys: string[] = [];
    for await (const [key] of this.cache.stores[0].iterator({})) {
      keys.push(key);
    }
    return keys;
  }

  async clear(): Promise<void> {
    const store = redisStoreOf(this.cache);

    // @keyv/redis's clear() unlinks every key in a single multi-key command,
    // which a cluster rejects with CROSSSLOT. Route it through delMany, which
    // knows how to delete key by key when clustered.
    if (store.redis?.isCluster) {
      await this.delMany(await this.keys());
      return;
    }

    // Removes every key and the tracking set in one operation.
    await this.cache.clear();
  }

  get ready(): boolean {
    const client = redisStoreOf(this.cache).redis;
    return client.status === 'ready';
  }
}
