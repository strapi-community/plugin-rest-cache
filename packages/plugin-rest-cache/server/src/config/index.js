'use strict';

export default {
  default: () => ({
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
      resetOnStartup: false,
      clearRelatedCache: true,
      keysPrefix: '',
      keys: {
        useHeaders: [],
        useQueryParams: true,
      },
      hitpass: (ctx) => Boolean(ctx.request.headers.authorization || ctx.request.headers.cookie),
      maxAge: 3600000,
      contentTypes: [],
    },
  }),
  validator() {},
};
