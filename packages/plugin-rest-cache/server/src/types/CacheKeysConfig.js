'use strict';

export class CacheKeysConfig {
  /**
   * @type {string[]}
   */
  useHeaders = [];

  /**
   * @type {Boolean|string[]}
   */
  useQueryParams = true;

  /**
   * Include the authenticated caller's identity in the cache key.
   *
   * Only relevant when hitpass is disabled, since the default hitpass never
   * caches an authenticated request. Without it, two callers authorised for the
   * same route share one entry.
   *
   * @see https://github.com/strapi-community/plugin-rest-cache/issues/113
   * @type {Boolean}
   */
  useAuth = false;

  constructor(options = {}) {
    const { useHeaders = [], useQueryParams = true, useAuth = false } = options;
    this.useHeaders = useHeaders;
    this.useQueryParams = useQueryParams;
    this.useAuth = useAuth;

    this.useHeaders.sort();
  }
}
