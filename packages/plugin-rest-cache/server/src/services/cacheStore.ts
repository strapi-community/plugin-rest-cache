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
 * Declared explicitly rather than inferred because several methods consult
 * `this.ready`, and inferring the object's type from members that reference it
 * is circular - TypeScript resolves `ready` to `any` and every guard silently
 * stops being checked.
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
  const keysPrefixRe = keysPrefix ? new RegExp(`^${keysPrefix}`) : null;

  return {
    async init(newProvider) {
      provider = newProvider;
      initialized = true;
    },

    async get(key) {
      if (!initialized) {
        strapi.log.error('REST Cache provider not initialized');
        return null;
      }

      if (!this.ready) {
        strapi.log.error('REST Cache provider not ready');
        return null;
      }

      return withTimeout(
        async () => deserialize((await provider.get(`${keysPrefix}${key}`)) as string),
        getTimeout
      ).catch((error) => {
        if (error?.message === 'timeout') {
          strapi.log.error(`REST Cache provider timed-out after ${getTimeout}ms.`);
        } else {
          strapi.log.error(`REST Cache provider errored:`);
          strapi.log.error(error);
        }
        return null;
      });
    },

    async set(key, val, maxAge = 3600000) {
      if (!initialized) {
        strapi.log.error('REST Cache provider not initialized');
        return null;
      }

      if (!this.ready) {
        strapi.log.error('REST Cache provider not ready');
        return null;
      }

      try {
        return provider.set(`${keysPrefix}${key}`, serialize(val), maxAge);
      } catch (error) {
        strapi.log.error(`REST Cache provider errored:`);
        strapi.log.error(error);
        return null;
      }
    },

    async del(key) {
      if (!initialized) {
        strapi.log.error('REST Cache provider not initialized');
        return null;
      }

      if (!this.ready) {
        strapi.log.error('REST Cache provider not ready');
        return null;
      }

      try {
        debug('strapi:plugin-rest-cache')(`${colors.redBright('[PURGING KEY]')}: ${key}`);
        return provider.del(`${keysPrefix}${key}`);
      } catch (error) {
        strapi.log.error(`REST Cache provider errored:`);
        strapi.log.error(error);
        return null;
      }
    },

    async delMany(keys) {
      if (!initialized) {
        strapi.log.error('REST Cache provider not initialized');
        return null;
      }

      if (!this.ready) {
        strapi.log.error('REST Cache provider not ready');
        return null;
      }

      if (!keys.length) {
        return null;
      }

      debug('strapi:plugin-rest-cache')(
        `${colors.redBright('[PURGING]')}: ${keys.length} key(s)`
      );

      try {
        return await provider.delMany(keys.map((key) => `${keysPrefix}${key}`));
      } catch (error) {
        strapi.log.error(`REST Cache provider errored:`);
        strapi.log.error(error);
        return null;
      }
    },

    async keys() {
      if (!initialized) {
        strapi.log.error('REST Cache provider not initialized');
        return null;
      }

      if (!this.ready) {
        strapi.log.error('REST Cache provider not ready');
        return null;
      }

      try {
        return provider.keys(keysPrefix).then((keys) => {
          if (!keysPrefixRe) {
            return keys;
          }

          return keys
            .filter((key) => keysPrefixRe.test(key))
            .map((key) => key.replace(keysPrefixRe, ''));
        });
      } catch (error) {
        strapi.log.error(`REST Cache provider errored:`);
        strapi.log.error(error);
        return null;
      }
    },

    async reset() {
      if (!initialized) {
        strapi.log.error('REST Cache provider not initialized');
        return null;
      }

      if (!this.ready) {
        strapi.log.error('REST Cache provider not ready');
        return null;
      }

      try {
        // A prefixed store shares its keyspace with other consumers, so only
        // the keys belonging to this cache may be removed. Without a prefix the
        // provider can flush everything it holds in one operation.
        if (keysPrefix) {
          return await this.delMany((await this.keys()) || []);
        }

        return await provider.clear();
      } catch (error) {
        strapi.log.error(`REST Cache provider errored:`);
        strapi.log.error(error);
        return null;
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
      const keys = (await this.keys()) || [];

      const shouldDel = (key: string) =>
        regExps.find((r) => r.test(key.replace(keysPrefix, '')));

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
