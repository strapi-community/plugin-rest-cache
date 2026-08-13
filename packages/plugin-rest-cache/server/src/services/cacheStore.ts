import type { Core } from '@strapi/strapi';
import debug from 'debug';

import colors from '../utils/colors';
import { serialize } from '../utils/store/serialize';
import { deserialize } from '../utils/store/deserialize';
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
  get(key: CacheKey | string): Promise<unknown>;
  set(
    key: CacheKey | string,
    val: unknown,
    maxAge?: Milliseconds | number
  ): Promise<unknown>;
  del(key: CacheKey | string): Promise<unknown>;
  delMany(keys: Array<CacheKey | string>): Promise<unknown>;
  /** Every key held by this cache, with the configured keysPrefix stripped. */
  keys(): Promise<string[] | null>;
  reset(): Promise<unknown>;
  readonly ready: boolean;
  clearByRegexp(regExps?: RegExp[]): Promise<void>;
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

  return {
    async init(newProvider) {
      provider = newProvider;
      initialized = true;
    },

    async get(key) {
      if (unusable()) return null;

      return withTimeout(
        async () => deserialize((await provider.get(`${keysPrefix}${key}`)) as string),
        getTimeout
      ).catch((error) => {
        if (error?.message === 'timeout') {
          strapi.log.error(`REST Cache provider timed-out after ${getTimeout}ms.`);
          return null;
        }

        return logProviderError(error);
      });
    },

    async set(key, val, maxAge = 3600000) {
      if (unusable()) return null;

      try {
        return provider.set(`${keysPrefix}${key}`, serialize(val), maxAge);
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

    get ready() {
      if (!initialized) {
        strapi.log.error('REST Cache provider not initialized');
        return false;
      }

      return provider.ready;
    },

    async clearByRegexp(regExps = []) {
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
