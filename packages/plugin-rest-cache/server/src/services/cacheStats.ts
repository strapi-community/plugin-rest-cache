import type { Core } from '@strapi/strapi';

import type { CachePluginHitpass, ContentTypeUID, Milliseconds } from '../types/common';
import type { RestCachePluginConfig } from '../types/config';

export interface ContentTypeStats {
  uid: ContentTypeUID | string;
  entries: number;
  maxAge?: Milliseconds;
  hitpass: boolean;
  keysAuthIdentity: boolean;
  routes: string[];
  relatedContentTypes: string[];
}

export interface CacheSummary {
  /** Only the provider's name: `options` holds connection credentials. */
  provider: { name?: string };
  strategy: {
    enableEtag: boolean;
    enableXCacheHeaders: boolean;
    enableDocumentServiceMiddleware: boolean;
    clearRelatedCache: boolean;
    keysPrefix: string;
    maxAge: Milliseconds;
  };
  totals: { entries: number; etags: number; contentTypes: number };
  contentTypes: ContentTypeStats[];
}

export interface CacheStatsService {
  summary(): Promise<CacheSummary>;
}

/**
 * Introspection for the admin dashboard.
 *
 * Counts are derived from the store's own key list rather than tracked
 * separately, so they cannot drift from reality. That does mean a call costs
 * one enumeration - cheap on redis since #131 made it a single SMEMBERS, but
 * still not something to poll aggressively.
 *
 * @see https://github.com/strapi-community/plugin-rest-cache/issues/114
 */
export default function createCacheStatsService({
  strapi,
}: {
  strapi: Core.Strapi;
}): CacheStatsService {
  return {
    /**
     * A snapshot of what the cache currently holds, grouped by content type.
     */
    async summary() {
      const { provider, strategy } =
        strapi.config.get<RestCachePluginConfig>('plugin::rest-cache');
      const cacheConfig = strapi.plugin('rest-cache').service('cacheConfig');
      const cacheStore = strapi.plugin('rest-cache').service('cacheStore');

      const keys: string[] = (await cacheStore.keys()) ?? [];

      // ETag entries are companions to a body entry, not cache entries in their
      // own right. Counting them would double every number on the dashboard.
      const entryKeys = keys.filter((key) => !key.endsWith('_etag'));
      const etagCount = keys.length - entryKeys.length;

      const contentTypes: ContentTypeStats[] = cacheConfig
        .getUids()
        .map((uid: string) => {
          const conf = cacheConfig.get(uid);
          const regExps: RegExp[] = cacheConfig.getCacheKeysRegexp(uid, {}, true);
          const matched = entryKeys.filter((key) => regExps.some((r) => r.test(key)));

          return {
            uid,
            entries: matched.length,
            maxAge: conf?.maxAge,
            hitpass: (conf?.hitpass as CachePluginHitpass | boolean) !== false,
            keysAuthIdentity: conf?.keys?.useAuth === true,
            routes: (conf?.routes ?? [])
              .filter((route) => route.method === 'GET')
              .map((route) => route.path as string),
            relatedContentTypes: cacheConfig.getRelatedCachedUid(uid),
          };
        });

      // A key can match more than one content type's routes, and a route may
      // have no configured content type at all, so this is deliberately the
      // total rather than the sum of the per-type counts.
      return {
        provider: { name: provider?.name },
        strategy: {
          enableEtag: strategy.enableEtag,
          enableXCacheHeaders: strategy.enableXCacheHeaders,
          enableDocumentServiceMiddleware: strategy.enableDocumentServiceMiddleware,
          clearRelatedCache: strategy.clearRelatedCache,
          keysPrefix: strategy.keysPrefix,
          maxAge: strategy.maxAge,
        },
        totals: {
          entries: entryKeys.length,
          etags: etagCount,
          contentTypes: contentTypes.length,
        },
        contentTypes,
      };
    },
  };
}
