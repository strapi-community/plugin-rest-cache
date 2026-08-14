import type { Context } from 'koa';

import type { CachePluginStrategyInput } from '../types/inputs';
import type { CacheProviderConfig } from '../types/config';

/**
 * Defaults, before resolution.
 *
 * `strategy` is the *input* shape rather than the resolved CachePluginStrategy:
 * at this point contentTypes are still bare uids or partial objects, and
 * register.ts is what turns them into resolved config.
 */
export interface RestCachePluginConfigInput {
  provider: CacheProviderConfig;
  strategy: CachePluginStrategyInput;
}

export default {
  default: (): RestCachePluginConfigInput => ({
    provider: {
      name: 'memory',
      getTimeout: 500,
      options: {
        maxSize: 32767,
      },
    },
    strategy: {
      debug: false,
      enableEtag: false,
      enableXCacheHeaders: false,
      enableAdminCTBMiddleware: true,
      // Invalidate from the document service instead of from HTTP route
      // middleware. Catches writes that no route can see (GraphQL mutations,
      // scheduled Content Releases, custom strapi.documents() calls) and
      // cannot drift out of sync with Strapi's route list.
      // Set to false to fall back to the legacy route-injection behaviour.
      enableDocumentServiceMiddleware: true,
      // Expose POST /api/rest-cache/purge for purging from outside the admin
      // panel. Off by default: purging is destructive and cheap to trigger, so
      // it should not appear on the public API surface just because you
      // upgraded. When enabled the route still requires content-api
      // authentication and must be granted to the caller's role or API token.
      enableContentApiPurge: false,
      resetOnStartup: false,
      // Emit Cache-Control on responses this plugin cached. Off, and meant to
      // stay opt-in rather than merely default-off for upgrades: the header
      // hands the caching decision to browsers and CDNs, which no purge can
      // reach, so every max-age emitted is a window during which stale content
      // is served whatever an admin does.
      // See https://github.com/strapi-community/plugin-rest-cache/issues/175
      cacheControl: {
        enabled: false,
        maxAge: 'config',
        scope: 'private',
        staleWhileRevalidate: null,
      },
      clearRelatedCache: true,
      keysPrefix: '',
      keys: {
        useHeaders: [],
        useQueryParams: true,
      },
      hitpass: (ctx: Context) =>
        Boolean(ctx.request.headers.authorization || ctx.request.headers.cookie),
      maxAge: 3600000,
      contentTypes: [],
    },
  }),
  validator() {},
};
