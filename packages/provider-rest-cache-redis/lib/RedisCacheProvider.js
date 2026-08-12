'use strict';

const { createCache } = require('cache-manager');
const Keyv = require('keyv').default;
const KeyvRedis = require('@keyv/redis');
const { CacheProvider } = require('@strapi-community/plugin-rest-cache/types');

class RedisCacheProvider extends CacheProvider {
  constructor(client, options) {
    super();

    const { ttl, ...adapterOptions } = options;

    this.client = client;
    this.cache = createCache({
      ttl,
      stores: [
        new Keyv({
          store: new KeyvRedis.default(client, adapterOptions),
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
