'use strict';

/* eslint-disable class-methods-use-this */
/* eslint-disable no-unused-vars */

/**
 * Abstract Class CacheProvider.
 *
 * @class CacheProvider
 */
export class CacheProvider {
  constructor() {
    if (this.constructor === CacheProvider) {
      throw new Error("CacheProvider class can't be instantiated.");
    }
  }

  /**
   * @param {string} key
   */
  async get(key) {
    throw new Error("Method 'get()' must be implemented.");
  }

  /**
   * @param {string} key
   * @param {any} val
   * @param {number=} maxAge in milliseconds
   */
  async set(key, val, maxAge = 3600000) {
    throw new Error("Method 'set()' must be implemented.");
  }

  /**
   * @param {string|string[]} key
   */
  async del(key) {
    throw new Error("Method 'del()' must be implemented.");
  }

  /**
   * Delete many keys at once.
   *
   * Optional. This default is intentionally conservative so existing providers
   * keep working unchanged - it just deletes one at a time, with bounded
   * concurrency so a large purge cannot open thousands of simultaneous
   * connections. Providers backed by a store with a batch delete should
   * override it; a purge is otherwise one round trip per key.
   *
   * @see https://github.com/strapi-community/plugin-rest-cache/issues/131
   * @param {string[]} keys
   */
  async delMany(keys) {
    const CONCURRENCY = 16;

    for (let i = 0; i < keys.length; i += CONCURRENCY) {
      await Promise.all(keys.slice(i, i + CONCURRENCY).map((key) => this.del(key)));
    }
  }

  async keys() {
    throw new Error("Method 'keys()' must be implemented.");
  }

  /**
   * Remove every entry this provider holds.
   *
   * Optional. Defaults to enumerating and deleting, which is what the store did
   * before this existed. Providers with a native flush should override it.
   */
  async clear() {
    await this.delMany(await this.keys());
  }

  get ready() {
    throw new Error("getter 'ready' must be implemented.");
  }
}
