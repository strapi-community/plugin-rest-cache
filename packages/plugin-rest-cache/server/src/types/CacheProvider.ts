import type { CacheKey, Milliseconds } from './common';

/**
 * Contract every cache provider implements.
 *
 * `delMany` and `clear` are optional in practice: the base class supplies
 * working defaults that behave exactly as the store did before they existed,
 * so a third-party provider written against the older contract keeps working
 * unchanged. Providers backed by a store with batch operations should override
 * them - a purge is otherwise one round trip per key.
 *
 * @see https://github.com/strapi-community/plugin-rest-cache/issues/131
 */
export abstract class CacheProvider {
  constructor() {
    if (this.constructor === CacheProvider) {
      throw new Error("CacheProvider class can't be instantiated.");
    }
  }

  abstract get(key: CacheKey | string): Promise<unknown>;

  /**
   * @param maxAge in milliseconds. Do not convert: cache-manager's ttl is also
   * milliseconds, and converting again is what made every entry outlive its
   * configured lifetime by a factor of 1000.
   */
  abstract set(
    key: CacheKey | string,
    val: unknown,
    maxAge?: Milliseconds | number
  ): Promise<unknown>;

  abstract del(key: CacheKey | string | string[]): Promise<unknown>;

  /**
   * Every key this provider holds, without the store's configured keysPrefix
   * and without any adapter-internal qualification.
   *
   * The store passes its keysPrefix, and neither shipped provider reads it -
   * the store filters and strips the prefix itself, because a provider that
   * ignored the argument would otherwise return a superset and silently break
   * that filtering. It stays in the signature so third-party providers that do
   * use it to narrow their enumeration keep receiving it.
   */
  abstract keys(keysPrefix?: string): Promise<string[]>;

  abstract get ready(): boolean;

  /**
   * Delete many keys at once.
   *
   * Conservative default: one at a time, with bounded concurrency so a large
   * purge cannot open thousands of simultaneous operations.
   */
  async delMany(keys: Array<CacheKey | string>): Promise<void> {
    const CONCURRENCY = 16;

    for (let i = 0; i < keys.length; i += CONCURRENCY) {
      await Promise.all(keys.slice(i, i + CONCURRENCY).map((key) => this.del(key)));
    }
  }

  /** Remove every entry this provider holds. */
  async clear(): Promise<void> {
    await this.delMany(await this.keys());
  }
}
