'use strict';

module.exports = ({ env }) => ({
  debug: false,
  maxAge: env.int("ENABLE_MAX_AGE", 3600000),
  enableEtag: env.bool("ENABLE_ETAG", true),
  enableXCacheHeaders: env.bool("ENABLE_XCACHE_HEADERS", true),
  enableAdminCTBMiddleware: env.bool("ENABLE_ADMIN_CTB_MIDDLEWARE", true),
  enableDocumentServiceMiddleware: env.bool(
    "ENABLE_DOCUMENT_SERVICE_MIDDLEWARE",
    true
  ),
  enableContentApiPurge: env.bool("ENABLE_CONTENT_API_PURGE", false),
  resetOnStartup: env.bool("RESET_STARTUP", false),
  clearRelatedCache: env.bool(
    "CLEAR_RELATED_CACHE",
    // legacy misspelling, kept so existing setups keep working
    env.bool("CREAR_RELATED_CACHE", true)
  ),
  keysPrefix: env("KEYS_PREFIX", ''),
  keys: env.json("KEYS", {
    useHeaders: [],
    useQueryParams: true,
  }),
  hitpass: (ctx) =>
    Boolean(
      ctx.request.headers.authorization || ctx.request.headers.cookie
    ),
  contentTypes: [
    "api::article.article",
    // A content type whose singular name ("editor") differs from its parent
    // API ("writer"). See
    // https://github.com/strapi-community/plugin-rest-cache/issues/125
    "api::writer.editor",
    "api::global.global",
    "api::homepage.homepage",
    {
      contentType: "api::category.category",
      maxAge: 3600000,
      hitpass: false,
      keys: {
        useQueryParams: false,
        useHeaders: ["accept-encoding"],
      },
      routes: [
        // Deliberately configured for caching so the plugin's refusal to cache
        // them is exercised, rather than assumed.
        { path: "/api/categories/probe/raw", method: "GET" },
        { path: "/api/categories/probe/stream", method: "GET" },
        { path: "/api/categories/probe/with-cookie", method: "GET" },
        {
          path: "/api/categories/slug/:slug+",
          keys: {
            useQueryParams: ["populate", "locale"],
            useHeaders: [],
          },
          maxAge: 18000,
          method: "GET",
        },
      ],
    },
  ],
});
