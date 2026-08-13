'use strict';

/**
 * @typedef {import('@strapi/strapi').Strapi} Strapi
 * @typedef {import('./types').CacheProvider} CacheProvider
 */
import colors from '../utils/colors';
import debug from 'debug';

import { serialize } from '../utils/store/serialize';
import { deserialize } from '../utils/store/deserialize';
import { withTimeout } from '../utils/store/withTimeout';

// @todo: use cache provider instead of hard-coded LRU

/**
 * @param {{ strapi: Strapi }} strapi
 */
export default function createCacheStoreService({ strapi }) {
  /**
   * @type {CacheProvider}
   */
  let provider;
  let initialized = false;

  const pluginConfig = strapi.config.get('plugin::rest-cache');
  const { getTimeout } = pluginConfig.provider;
  const { keysPrefix } = pluginConfig.strategy;
  const keysPrefixRe = keysPrefix ? new RegExp(`^${keysPrefix}`) : null;

  return {
    /**
     * @param {CacheProvider} provider
     */
    async init(newProvider) {
      provider = newProvider;
      initialized = true;
    },

    /**
     * @param {string} key
     */
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
        async () => deserialize(await provider.get(`${keysPrefix}${key}`)),
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

    /**
     * @param {string} key
     * @param {any} val
     * @param {number=} maxAge in milliseconds
     */
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

    /**
     * @param {string} key
     */
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

    /**
     * @param {string[]} keys
     */
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

    /**
     * @param {RegExp[]} regExps
     */
    async clearByRegexp(regExps = []) {
      const keys = (await this.keys()) || [];

      /**
       * @param {string} key
       */
      const shouldDel = (key) => regExps.find((r) => r.test(key.replace(keysPrefix, '')));

      // One batched delete rather than an unbounded Promise.all of individual
      // deletes, which on redis was a round trip per key and opened as many
      // simultaneous operations as there were matches.
      await this.delMany(keys.filter(shouldDel));
    },

    /**
     * @param {string} uid
     * @param {any} params
     * @param {boolean=} wildcard
     */
    async clearByUid(uid, params = {}, wildcard = false) {
      const { strategy } = strapi.config.get('plugin::rest-cache');

      const cacheConfigService = strapi.plugin('rest-cache').service('cacheConfig');

      const cacheConf = cacheConfigService.get(uid);

      if (!cacheConf) {
        throw new Error(`Unable to clear cache: no configuration found for contentType "${uid}"`);
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
