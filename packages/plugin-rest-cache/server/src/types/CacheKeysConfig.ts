import type { CacheKeysConfigInput } from './inputs';

export class CacheKeysConfig {
  useHeaders: string[] = [];

  useQueryParams: boolean | string[] = true;

  /**
   * Include the authenticated caller's identity in the cache key.
   *
   * Only relevant when hitpass is disabled, since the default hitpass never
   * caches an authenticated request. Without it, two callers authorised for the
   * same route share one entry.
   *
   * @see https://github.com/strapi-community/plugin-rest-cache/issues/113
   */
  useAuth: boolean = false;

  constructor(options: CacheKeysConfigInput = {}) {
    const { useHeaders = [], useQueryParams = true, useAuth = false } = options;

    this.useHeaders = [...useHeaders].sort();
    this.useQueryParams = useQueryParams;
    this.useAuth = useAuth;
  }
}
