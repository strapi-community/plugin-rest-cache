'use strict';

const { createCache } = require('cache-manager');
const { CacheProvider } = require('@strapi-community/plugin-rest-cache/types');

// keyv 4 exports the constructor directly, keyv 5 exports it as `.default`.
// Accept both: which one we get depends on what else in the host application's
// dependency tree won the hoist.
const keyvModule = require('keyv');
const Keyv = keyvModule.default ?? keyvModule;

class MemoryCacheProvider extends CacheProvider {
  /**
   * quick-lru v7 is ESM-only, so it cannot be require()d from CommonJS on Node
   * versions without require(esm) (added in 20.19). Loading it with a dynamic
   * import works on every supported Node version, which is why construction
   * goes through this factory rather than the constructor.
   *
   * Do not "simplify" this back to a top-level require - see
   * https://github.com/strapi-community/plugin-rest-cache/issues/128
   *
   * @param {object} options
   */
  static async create(options) {
    const quickLruModule = await import('quick-lru');
    const QuickLRU = quickLruModule.default ?? quickLruModule;

    return new MemoryCacheProvider(options, QuickLRU);
  }

  /**
   * Prefer MemoryCacheProvider.create(), which resolves QuickLRU for you.
   *
   * @param {object} options
   * @param {Function} QuickLRU the quick-lru constructor
   */
  constructor(options, QuickLRU) {
    super();

    if (typeof QuickLRU !== 'function') {
      throw new Error(
        'MemoryCacheProvider requires the QuickLRU constructor. Use MemoryCacheProvider.create(options) instead of calling the constructor directly.'
      );
    }

    const { ttl, ...adapterOptions } = options;

    if (adapterOptions.max) {
      adapterOptions.maxSize = adapterOptions.max;
      delete adapterOptions.max;
    }

    this.cache = createCache({
      ttl,
      stores: [
        new Keyv({
          store: new QuickLRU(adapterOptions),
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
