import type { Core } from '@strapi/strapi';
import debug from 'debug';

import colors from '../utils/colors';
import { serialize, type CacheEntryMeta } from '../utils/store/serialize';
import { deserializeEntry, type CacheEntry } from '../utils/store/deserialize';
import { withTimeout } from '../utils/store/withTimeout';
import type { CacheProvider } from '../types';
import type { CacheKey, ContentTypeUID, Milliseconds } from '../types/common';
import type { RestCachePluginConfig } from '../types/config';

// @todo: use cache provider instead of hard-coded LRU

/**
 * The cache as the rest of the plugin sees it.
 *
 * Declared explicitly rather than inferred because reset, clearByRegexp and
 * clearByUid reach other members through `this`, and inferring an object's type
 * from members that reference it is circular - TypeScript resolves those
 * members to `any` and stops checking the calls entirely.
 */
export interface CacheStoreService {
  init(newProvider: CacheProvider): Promise<void>;
  /** The stored body alone. */
  get(key: CacheKey | string): Promise<unknown>;
  /**
   * The stored body together with what was kept about the response, such as
   * its Content-Type. `get` is unchanged so existing callers are unaffected.
   */
  getEntry(key: CacheKey | string): Promise<CacheEntry | null>;
  set(
    key: CacheKey | string,
    val: unknown,
    maxAge?: Milliseconds | number,
    meta?: CacheEntryMeta
  ): Promise<unknown>;
  del(key: CacheKey | string): Promise<unknown>;
  delMany(keys: Array<CacheKey | string>): Promise<unknown>;
  /** Every key held by this cache, with the configured keysPrefix stripped. */
  keys(): Promise<string[] | null>;
  reset(): Promise<unknown>;
  readonly ready: boolean;
  clearByRegexp(regExps?: RegExp[]): Promise<void>;
  /**
   * The number of purges this process has started. Read it before fetching a
   * response from the origin, then hand it to purgedSince.
   */
  readonly generation: number;
  /**
   * Whether a purge that could have removed `key` started after `generation`
   * was read. Errs towards true when it can no longer tell.
   */
  purgedSince(generation: number, key: CacheKey | string): boolean;
  clearByUid(
    uid: ContentTypeUID | string,
    params?: Record<string, string | number>,
    wildcard?: boolean
  ): Promise<void>;
}

export default function createCacheStoreService({
  strapi,
}: {
  strapi: Core.Strapi;
}): CacheStoreService {
  let provider: CacheProvider;
  let initialized = false;

  const pluginConfig = strapi.config.get<RestCachePluginConfig>('plugin::rest-cache');
  const { getTimeout } = pluginConfig.provider;
  const { keysPrefix } = pluginConfig.strategy;

  /**
   * Whether the provider cannot be used right now.
   *
   * Every operation opened with these same two checks and the same two log
   * lines. Kept as a plain call rather than a wrapper around each method: this
   * sits on the per-request read path, and a closure per operation buys
   * nothing.
   */
  const unusable = (): boolean => {
    if (!initialized) {
      strapi.log.error('REST Cache provider not initialized');
      return true;
    }

    if (!provider.ready) {
      strapi.log.error('REST Cache provider not ready');
      return true;
    }

    return false;
  };

  const logProviderError = (error: unknown): null => {
    strapi.log.error(`REST Cache provider errored:`);
    strapi.log.error(error);
    return null;
  };

  /**
   * Strip the configured prefix from a stored key.
   *
   * String operations rather than a regexp. The regexp was built by
   * interpolating the prefix straight into a pattern, so any prefix containing
   * a metacharacter meant something other than itself - `+` or `$` in a prefix
   * made the filter match no keys at all, which reads as an empty cache and
   * silently disables both purging and reset. It is also two regexp passes per
   * key on a list that can run to six figures.
   */
  const hasPrefix = (key: string): boolean => key.startsWith(keysPrefix);
  const stripPrefix = (key: string): string => key.slice(keysPrefix.length);

  /**
   * Shared by get and getEntry. A plain function rather than `this.getEntry`,
   * because get used not to depend on `this`, and a caller that detached it -
   * `const { get } = cacheStore` - must keep working.
   */
  const readEntry = async (key: CacheKey | string): Promise<CacheEntry | null> => {
    if (unusable()) return null;

    return withTimeout(
      async () => deserializeEntry((await provider.get(`${keysPrefix}${key}`)) as string),
      getTimeout
    ).catch((error) => {
      if (error?.message === 'timeout') {
        strapi.log.error(`REST Cache provider timed-out after ${getTimeout}ms.`);
        return null;
      }

      return logProviderError(error);
    });
  };

  /**
   * Recent purges, so a response read from the origin before a purge is not
   * stored after it.
   *
   * A cache miss reads the origin, and only then stores what it read. A write
   * landing in between purges first, and the miss then stores its pre-write
   * body on top of the purge, where it survives until maxAge. Awaiting the
   * store (#132) does not help: the read itself happened before the write.
   * recv reads `generation` before calling the origin and asks purgedSince
   * before storing.
   *
   * Each entry keeps the purge's patterns rather than bumping a single
   * counter, so the check is scoped to the key: a purge of an unrelated content
   * type does not stop an in-flight response from being stored. Without that, a
   * steady stream of unrelated writes would stop anything from being cached.
   * `null` patterns stand for reset, which removes everything.
   *
   * Bounded, since nothing reads an entry once every request that started
   * before it has finished. A request older than the oldest entry still kept
   * is treated as purged, which costs it one store and never serves stale data.
   */
  const PURGE_LOG_SIZE = 1000;
  const purgeLog: Array<{ generation: number; regExps: RegExp[] | null }> = [];
  let generation = 0;

  /**
   * Record a purge before it reads the key list.
   *
   * Before, not after: a store landing after the purge has listed the keys is
   * not deleted by it, so it has to be visible to purgedSince from the moment
   * the purge starts.
   */
  const recordPurge = (regExps: RegExp[] | null): void => {
    generation += 1;
    purgeLog.push({ generation, regExps });
    if (purgeLog.length > PURGE_LOG_SIZE) {
      purgeLog.shift();
    }
  };

  return {
    async init(newProvider) {
      provider = newProvider;
      initialized = true;
    },

    async get(key) {
      const entry = await readEntry(key);

      return entry ? entry.data : null;
    },

    getEntry: readEntry,

    async set(key, val, maxAge = 3600000, meta = {}) {
      if (unusable()) return null;

      // maxAge 0 (or less) means "do not cache". keyv and cache-manager read a
      // ttl of 0 as "no expiry", so passing it through stored the entry forever.
      if (typeof maxAge === 'number' && maxAge <= 0) return null;

      try {
        return provider.set(`${keysPrefix}${key}`, serialize(val, meta), maxAge);
      } catch (error) {
        return logProviderError(error);
      }
    },

    async del(key) {
      if (unusable()) return null;

      try {
        debug('strapi:plugin-rest-cache')(`${colors.redBright('[PURGING KEY]')}: ${key}`);
        return provider.del(`${keysPrefix}${key}`);
      } catch (error) {
        return logProviderError(error);
      }
    },

    async delMany(keys) {
      if (unusable()) return null;

      if (!keys.length) {
        return null;
      }

      debug('strapi:plugin-rest-cache')(
        `${colors.redBright('[PURGING]')}: ${keys.length} key(s)`
      );

      try {
        return await provider.delMany(keys.map((key) => `${keysPrefix}${key}`));
      } catch (error) {
        return logProviderError(error);
      }
    },

    async keys() {
      if (unusable()) return null;

      try {
        return provider.keys(keysPrefix).then((keys) => {
          if (!keysPrefix) {
            return keys;
          }

          return keys.filter(hasPrefix).map(stripPrefix);
        });
      } catch (error) {
        return logProviderError(error);
      }
    },

    async reset() {
      if (unusable()) return null;

      recordPurge(null);

      try {
        // A prefixed store shares its keyspace with other consumers, so only
        // the keys belonging to this cache may be removed. Without a prefix the
        // provider can flush everything it holds in one operation.
        if (keysPrefix) {
          return await this.delMany((await this.keys()) || []);
        }

        return await provider.clear();
      } catch (error) {
        return logProviderError(error);
      }
    },

    get generation() {
      return generation;
    },

    purgedSince(since, key) {
      if (since === generation) {
        return false;
      }

      // Entries since `since` have been dropped: we cannot tell, so assume it
      // was purged.
      if (!purgeLog.length || purgeLog[0].generation > since + 1) {
        return true;
      }

      for (let i = purgeLog.length - 1; i >= 0 && purgeLog[i].generation > since; i--) {
        const { regExps } = purgeLog[i];
        if (!regExps || regExps.some((r) => r.test(key))) {
          return true;
        }
      }

      return false;
    },

    get ready() {
      if (!initialized) {
        strapi.log.error('REST Cache provider not initialized');
        return false;
      }

      return provider.ready;
    },

    async clearByRegexp(regExps = []) {
      recordPurge([...regExps]);

      // Already logical keys: keys() filters on the prefix and strips it. This
      // used to strip it a second time with a plain String.replace, which
      // removes the first occurrence anywhere rather than an anchored prefix -
      // so a prefix of "api" turned "/api/articles?..." into "//articles?...",
      // no purge regexp matched, and the entry survived until maxAge.
      const keys = (await this.keys()) || [];

      const shouldDel = (key: string) => regExps.some((r) => r.test(key));

      // One batched delete rather than an unbounded Promise.all of individual
      // deletes, which on redis was a round trip per key and opened as many
      // simultaneous operations as there were matches.
      await this.delMany(keys.filter(shouldDel));
    },

    async clearByUid(uid, params = {}, wildcard = false) {
      const { strategy } = strapi.config.get<RestCachePluginConfig>('plugin::rest-cache');

      const cacheConfigService = strapi.plugin('rest-cache').service('cacheConfig');

      const cacheConf = cacheConfigService.get(uid);

      if (!cacheConf) {
        throw new Error(
          `Unable to clear cache: no configuration found for contentType "${uid}"`
        );
      }

      const regExps = cacheConfigService.getCacheKeysRegexp(uid, params, wildcard);

      if (strategy.clearRelatedCache) {
        for (const relatedUid of cacheConf.relatedContentTypeUid) {
          if (cacheConfigService.isCached(relatedUid)) {
            // clear all cache because we can't predict uri params
            regExps.push(...cacheConfigService.getCacheKeysRegexp(relatedUid, {}, true));
          }
        }
      }

      await this.clearByRegexp(regExps);
    },
  };
}
