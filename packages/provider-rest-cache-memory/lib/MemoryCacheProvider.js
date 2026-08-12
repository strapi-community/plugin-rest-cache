'use strict';

const Keyv = require('keyv').default;
const QuickLRU = require('quick-lru');
const { createCache } = require('cache-manager');
const { CacheProvider } = require('@strapi-community/plugin-rest-cache/types');

class MemoryCacheProvider extends CacheProvider {
  constructor(options) {
    super();

    const { ttl, ...adapterOptions } = options;

    if (adapterOptions.max) {
      adapterOptions.maxSize = adapterOptions.max;
      delete adapterOptions.max;
    }

    this.cache = createCache({
      ttl,
      stores: [
        new Keyv({
          store: new QuickLRU.default(adapterOptions),
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
    return true;
  }
}

module.exports = {
  MemoryCacheProvider,
};
