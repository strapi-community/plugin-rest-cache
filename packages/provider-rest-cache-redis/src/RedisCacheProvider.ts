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

/** A queued pipeline, as ioredis returns it from `pipeline()`. */
export interface RedisPipeline {
  exists(key: string): unknown;
  exec(): Promise<Array<[Error | null, unknown]> | null>;
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
  sadd(key: string, ...members: string[]): Promise<unknown>;
  unlink(...keys: string[]): Promise<unknown>;
  srem(key: string, ...members: string[]): Promise<unknown>;
  exists?(key: string): Promise<number>;
  multi(): RedisMulti;
  pipeline?(): RedisPipeline;
  scan?(cursor: string, ...args: Array<string | number>): Promise<[string, string[]]>;
  sscan?(
    key: string,
    cursor: string,
    ...args: Array<string | number>
  ): Promise<[string, string[]]>;
  /** On an ioredis Cluster: one client per node. */
  nodes?(role: 'master'): RedisClient[];
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

/** @keyv/redis' own read/write methods, which a cluster needs replaced. */
interface KeyvRedisAdapter extends KeyvRedisStore {
  redis: RedisClient & {
    set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  };
  _getKeyName(key: string): string;
  set(key: string, value: string | undefined, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
}

/**
 * Make @keyv/redis' writes and deletes work on a Redis Cluster.
 *
 * @keyv/redis 3 writes an entry and adds it to the tracking set in one MULTI,
 * and deletes them the same way. Those are two keys in different hash slots,
 * which a cluster refuses ("All keys in the pipeline should belong to the same
 * slots allocation group"). Keyv catches the failure and only emits it, so on
 * a cluster set() reported success and nothing was ever cached.
 *
 * Here the same two commands are issued separately, leaving the same keys, the
 * same PX lifetime and the same tracking set. Standalone servers keep the
 * MULTI.
 *
 * Without the MULTI a write and a delete of the same key can interleave, so
 * the order of each pair matters. A write is SET then SADD, and a delete is
 * SREM then UNLINK - both put the tracking-set change on the side where losing
 * the race is harmless. Deleting UNLINK-first could interleave as UNLINK
 * (delete) -> SET, SADD (write) -> SREM (delete): a live entry missing from the
 * tracking set, which keys() cannot see and so no purge can ever find - served
 * stale until maxAge, under nothing more than ordinary concurrency. Untracking
 * first, the same race leaves at worst a tracked key with nothing behind it,
 * which keys() prunes (#131).
 *
 * The cost is on the failure path: an error between SREM and UNLINK now leaves
 * an untracked entry, invisible to purges until it expires on its own maxAge.
 * Unlink-first was the safer order there - a failure left only a dead member -
 * but that took a failed command, and losing entries to the race took nothing
 * more than a purge arriving while responses were being cached.
 *
 * See https://github.com/strapi-community/plugin-rest-cache/issues/100
 */
function makeClusterSafe(store: KeyvRedisAdapter): void {
  const { redis } = store;

  store.set = async (key, value, ttl) => {
    if (value === undefined) return;
    const name = store._getKeyName(key);
    // ttl is milliseconds, as PX expects. Never converted.
    if (typeof ttl === 'number') {
      await redis.set(name, value, 'PX', ttl);
    } else {
      await redis.set(name, value);
    }
    if (store.opts?.useRedisSets !== false) {
      await redis.sadd(store._getNamespace!(), name);
    }
  };

  store.delete = async (key) => {
    const name = store._getKeyName(key);
    if (store.opts?.useRedisSets !== false) {
      await redis.srem(store._getNamespace!(), name);
    }
    const removed = Number(await redis.unlink(name));
    return removed > 0;
  };
}

/**
 * Whether each key exists, without a command that spans hash slots.
 *
 * A variadic EXISTS only returns a count, and a cluster rejects one whose keys
 * span slots, so each key is asked about on its own. On a standalone server
 * those go out as one pipeline; on a cluster each is routed to its node.
 *
 * A key whose check fails is reported as existing, and so is every key when
 * the check fails as a whole: dropping a member from the tracking set hides a
 * live entry from every purge, while keeping a dead one only costs a wasted
 * UNLINK later. Never rejects.
 */
async function existing(redis: RedisClient, keys: string[]): Promise<boolean[]> {
  try {
    if (!redis.isCluster && typeof redis.pipeline === 'function') {
      const pipeline = redis.pipeline();
      for (const key of keys) pipeline.exists(key);
      const replies = (await pipeline.exec()) ?? [];
      return keys.map((_, i) => {
        const [error, count] = replies[i] ?? [new Error('no reply'), 0];
        return error !== null || Number(count) > 0;
      });
    }

    return await Promise.all(
      keys.map((key) =>
        redis.exists!(key).then(
          (count) => Number(count) > 0,
          () => true
        )
      )
    );
  } catch {
    return keys.map(() => true);
  }
}

/**
 * How often, at most, one provider instance starts a prune of the tracking
 * set. Milliseconds, like every duration here.
 *
 * Expired members cost nothing until something lists them, so the prune only
 * has to keep the set from growing without bound, not keep it exact. Five
 * minutes keeps a busy cache's set within a few minutes' worth of expiries,
 * while a 100k-member pass (measured at 0.5-0.8s standalone and 2.4-4.4s on a
 * three-node cluster, spread across small batches) stays around 1% of the
 * interval or less. It is per process, so N Strapi replicas prune N times per
 * interval, which is wasted work but safe: passes do not depend on each other.
 */
const PRUNE_INTERVAL = 300000 as Milliseconds;

/**
 * Members checked per step of a prune. Small enough that one step - a pipeline
 * of EXISTS, or that many routed commands on a cluster - holds Strapi's event
 * loop for milliseconds rather than the whole pass at once, and that a reply
 * never gets large.
 */
const PRUNE_BATCH = 500;

interface PruneState {
  lastStarted: number;
  running: Promise<void> | null;
}

/**
 * Prune bookkeeping, keyed by the @keyv/redis store.
 *
 * Not a field on the provider: the plugin freezes the instance it gets back,
 * so it could never be written after construction.
 */
const pruneStates = new WeakMap<object, PruneState>();

function pruneStateOf(store: object): PruneState {
  let state = pruneStates.get(store);
  if (!state) {
    state = { lastStarted: -Infinity, running: null };
    pruneStates.set(store, state);
  }
  return state;
}

/** Whether the store keeps a tracking set this provider knows how to prune. */
function prunable(store: KeyvRedisStore): store is KeyvRedisStore & { redis: RedisClient } {
  const redis = store.redis;
  return (
    store.opts?.useRedisSets !== false &&
    !!store.namespace &&
    typeof store._getNamespace === 'function' &&
    !!redis &&
    typeof redis.sscan === 'function' &&
    typeof redis.exists === 'function' &&
    typeof redis.srem === 'function' &&
    typeof redis.sadd === 'function'
  );
}

/**
 * Put members back in the tracking set, trying twice.
 *
 * Re-tracking a member whose entry is gone is harmless, so this is called with
 * every member that might be live. Failures are swallowed: this runs behind
 * purges and writes, and a member it could not restore is the one residual
 * case documented on untrackDead.
 */
async function retrack(redis: RedisClient, set: string, members: string[]): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await redis.sadd(set, ...members);
      return;
    } catch {
      // Tried again once; see above.
    }
  }
}

/**
 * Untrack the members of one batch whose entries no longer exist.
 *
 * Only members with nothing behind them are dropped, which are exactly the
 * keys get() already returns nothing for. A write can land between the check
 * and the SREM, so the dropped members are checked once more afterwards and
 * any that now exist are tracked again: the write's SADD either follows that
 * second check or precedes it, and either way the entry stays tracked.
 *
 * Fail safe: once the SREM has been sent - whether or not it reported success,
 * since a failed reply does not prove it did not apply - a member is left out
 * only if a check after it found the entry gone. If that check fails, every
 * dropped member is put back. What remains is a write racing the prune *and*
 * both re-add attempts failing; that entry is then invisible to purges until
 * its maxAge, as with the failed SREM-then-UNLINK in makeClusterSafe. A Lua
 * script would close it on a standalone server, but not on a cluster, where
 * the entries live in other slots than the set.
 */
async function untrackDead(redis: RedisClient, set: string, members: string[]): Promise<void> {
  const found = await existing(redis, members);
  const dead = members.filter((_, i) => !found[i]);
  if (!dead.length) return;

  try {
    // One key, the set, so a batched SREM is slot-safe on a cluster too.
    await redis.srem(set, ...dead);
  } catch {
    // It may still have applied; the re-check below decides.
  }

  // existing() reports every member it could not check as live, so a failed
  // re-check re-tracks all of them.
  const recheck = await existing(redis, dead);
  const rewritten = dead.filter((_, i) => recheck[i]);
  if (rewritten.length) await retrack(redis, set, rewritten);
}

/**
 * One pass over the tracking set, untracking members whose entries expired.
 *
 * @keyv/redis SADDs a key on write and SREMs it only on an explicit delete. An
 * entry that expires through its PX lifetime is removed by Redis, but its
 * member stays, and the set has no lifetime of its own. So keys() listed
 * entries that had expired - cacheStats counted them, purges unlinked keys
 * that were already gone - and the set grew for as long as the cache ran.
 *
 * Incremental: SSCAN in batches of PRUNE_BATCH, so neither Redis nor Strapi's
 * event loop handles the whole set in one go. SSCAN tolerates the set changing
 * under it - every member present for the whole pass is returned at least once
 * - and a member it misses is only one the next pass will see.
 *
 * Never rejects. A pass that fails part-way stops there; what it did not reach
 * waits for the next one.
 *
 * See https://github.com/strapi-community/plugin-rest-cache/issues/131
 */
async function pruneTrackingSet(redis: RedisClient, set: string): Promise<void> {
  try {
    let cursor = '0';
    do {
      const [next, batch] = await redis.sscan!(set, cursor, 'COUNT', PRUNE_BATCH);
      cursor = next;
      if (batch.length) await untrackDead(redis, set, batch);
    } while (cursor !== '0');
  } catch {
    // See above: the next pass picks up where this one could not.
  }
}

/**
 * Start a prune pass unless one is running, or one started within `interval`.
 * Returns the pass in progress, if any.
 *
 * keys() and set() call this without awaiting it, so a purge or a write never
 * waits on a prune: keys() used to check every member itself, which at 100k
 * members took a pattern purge from ~70ms to 0.5s standalone and over 2s on a
 * cluster, on every content save.
 */
function startPrune(store: KeyvRedisStore, interval: number): Promise<void> | null {
  if (!prunable(store)) return null;

  const state = pruneStateOf(store);
  if (state.running) return state.running;
  if (Date.now() - state.lastStarted < interval) return null;

  state.lastStarted = Date.now();
  state.running = pruneTrackingSet(store.redis, store._getNamespace!()).finally(() => {
    state.running = null;
  });
  return state.running;
}

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

    const store = new KeyvRedis(client, adapterOptions);
    if (client.isCluster) {
      makeClusterSafe(store);
    }

    this.client = client;
    this.cache = createCache({
      ttl,
      stores: [new Keyv({ store })],
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
    const result = await this.cache.set(key, val, maxAge);
    // Writes are what add members, so a cache that is written to but never
    // purged or listed still gets its expired members pruned. Not awaited: a
    // write never waits on a prune, and a prune never rejects.
    startPrune(redisStoreOf(this.cache), PRUNE_INTERVAL);
    return result;
  }

  /**
   * Untrack every tracking-set member whose entry has expired, now.
   *
   * keys() and set() already start this in the background, at most once per
   * five minutes per provider instance, so nothing has to call it. It is
   * public so it can be awaited - by tests, or before a count that must not
   * include expired entries. Never rejects.
   *
   * See https://github.com/strapi-community/plugin-rest-cache/issues/131
   */
  async prune(): Promise<void> {
    const store = redisStoreOf(this.cache);
    // A pass already running may have scanned past members added since it
    // started, so wait for it and then make a pass of our own.
    await pruneStates.get(store)?.running;
    await startPrune(store, 0);
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
      // Untrack first, then unlink. Without a MULTI a purge interleaves with
      // responses being cached for the same keys, and unlinking first lost
      // entries: UNLINK (purge) -> SET, SADD (write) -> SREM (purge) left a
      // live entry outside the tracking set, which no later purge could find.
      // In this order the race leaves at worst a tracked key with nothing
      // behind it, which keys() prunes. makeClusterSafe has the trade-off.
      //
      // See https://github.com/strapi-community/plugin-rest-cache/issues/100
      if (store.redis.isCluster) {
        const SREM_CHUNK = 1000;
        for (let i = 0; i < qualified.length; i += SREM_CHUNK) {
          await store.redis.srem(namespace, ...qualified.slice(i, i + SREM_CHUNK));
        }

        const CONCURRENCY = 16;
        for (let i = 0; i < qualified.length; i += CONCURRENCY) {
          const batch = qualified.slice(i, i + CONCURRENCY);
          await Promise.all(batch.map((key) => store.redis.unlink(key)));
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

    // With useRedisSets off, @keyv/redis keeps no tracking set and names every
    // entry `sets:namespace:<ns>:<ns>:<key>`. Reading the set below returned
    // nothing, so every pattern purge matched nothing and entries survived until
    // maxAge. Find them by that name instead, on every master when clustered:
    // SCAN only sees the node it is sent to.
    if (store.opts?.useRedisSets === false && store.redis && namespace && store.namespace) {
      const named = `sets:${namespace}:`;
      const prefix = `${store.namespace}:`;
      const nodes = store.redis.isCluster ? store.redis.nodes?.('master') ?? [] : [store.redis];
      const found: string[] = [];

      for (const node of nodes) {
        let cursor = '0';
        do {
          const [next, batch] = await node.scan!(cursor, 'MATCH', `${named}*`, 'COUNT', 1000);
          cursor = next;
          found.push(...batch);
        } while (cursor !== '0');
      }

      return found
        .map((key) => key.slice(named.length))
        .map((key) => (key.startsWith(prefix) ? key.slice(prefix.length) : key));
    }

    if (typeof store.redis?.smembers === 'function' && namespace && store.namespace) {
      const members = await store.redis.smembers(namespace);

      // The set can still hold members whose entries expired since the last
      // prune pass - at most about PRUNE_INTERVAL's worth on a cache in use.
      // They are listed rather than checked here, because keys() runs on every
      // purge: a purge that matches one SREMs it and UNLINKs nothing, and the
      // stats count it until the next pass. Checking each member here instead
      // is what took a 100k-member purge from ~70ms to seconds. Started, not
      // awaited, and rate limited - see startPrune.
      startPrune(store, PRUNE_INTERVAL);

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
