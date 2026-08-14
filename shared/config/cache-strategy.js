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
  // Emit Cache-Control on responses this plugin cached. Off by default, as it
  // ships. See https://github.com/strapi-community/plugin-rest-cache/issues/175
  cacheControl: {
    enabled: env.bool("CACHE_CONTROL_ENABLED", false),
    // "none" | "config" | a number of MILLISECONDS, like every other duration
    // in this plugin.
    maxAge: /^\d+$/.test(env("CACHE_CONTROL_MAX_AGE", "config"))
      ? env.int("CACHE_CONTROL_MAX_AGE", 3600000)
      : env("CACHE_CONTROL_MAX_AGE", "config"),
    scope: env("CACHE_CONTROL_SCOPE", "private"),
    // Milliseconds. 0 means omit the directive.
    staleWhileRevalidate:
      env.int("CACHE_CONTROL_STALE_WHILE_REVALIDATE", 0) || null,
  },
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
      // Caches authenticated requests, so the caller's identity has to be part
      // of the key. See https://github.com/strapi-community/plugin-rest-cache/issues/113
      hitpass: false,
      keys: {
        useQueryParams: false,
        useHeaders: ["accept-encoding"],
        useAuth: env.bool("CATEGORY_USE_AUTH", true),
      },
      routes: [
        // Deliberately configured for caching so the plugin's refusal to cache
        // them is exercised, rather than assumed.
        { path: "/api/categories/probe/raw", method: "GET" },
        { path: "/api/categories/probe/stream", method: "GET" },
        { path: "/api/categories/probe/with-cookie", method: "GET" },
        {
          // The handler sets its own Cache-Control, chosen by ?value=, so the
          // query string has to be part of the key here.
          path: "/api/categories/probe/cache-control",
          method: "GET",
          keys: { useQueryParams: true, useHeaders: [], useAuth: true },
        },
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
