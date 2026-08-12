'use strict';

const { createCache } = require('cache-manager');
const { CacheProvider } = require('@strapi-community/plugin-rest-cache/types');

// keyv 4 exports the constructor directly, keyv 5 exports it as `.default`, and
// @keyv/redis exposes only `.default` from its CJS build. Accept either shape:
// which one we get depends on what else in the host application's dependency
// tree won the hoist. See
// https://github.com/strapi-community/plugin-rest-cache/issues/128
const keyvModule = require('keyv');
const Keyv = keyvModule.default ?? keyvModule;

const keyvRedisModule = require('@keyv/redis');
const KeyvRedis = keyvRedisModule.default ?? keyvRedisModule;

class RedisCacheProvider extends CacheProvider {
  constructor(client, options) {
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

  /**
   * @param {string} key
   */
  async get(key) {
    return this.cache.get(key);
  }

  /**
   * @param {string} key
   * @param {any} val
   * @param {number=} maxAge in milliseconds
   */
  async set(key, val, maxAge = 3600000) {
    // cache-manager's set() takes a ttl in milliseconds and maxAge is already
    // in milliseconds - do not convert.
    return this.cache.set(key, val, maxAge);
  }

  /**
   * @param {string|string[]} key
   */
  async del(key) {
    return this.cache.del(key);
  }

  async keys() {
    const keys = [];
    for await (const [key] of this.cache.stores[0].iterator({})) {
      keys.push(key);
    }
    return keys;
  }

  get ready() {
    const client = this.cache.stores[0].opts.store.redis;
    return client.status === 'ready';
  }
}

module.exports = {
  RedisCacheProvider,
};
