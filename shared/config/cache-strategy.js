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
    // An entry whose maxAge / hitpass are present but undefined, as
    // `maxAge: env.int("SOME_UNSET_VAR")` produces. They must inherit exactly
    // like omitted keys. Opt-in, so the other specs see the plain entry.
    env.bool("ARTICLE_EXPLICIT_UNDEFINED", false)
      ? {
          contentType: "api::article.article",
          maxAge: undefined,
          hitpass: undefined,
          injectDefaultRoutes: undefined,
        }
      : "api::article.article",
    // A content type whose singular name ("editor") differs from its parent
    // API ("writer"). See
    // https://github.com/strapi-community/plugin-rest-cache/issues/125
    "api::writer.editor",
    "api::global.global",
    "api::homepage.homepage",
    // Reaches article only through a dynamic zone. See
    // https://github.com/strapi-community/plugin-rest-cache/issues/232
    "api::page.page",
    // A plugin-owned content type with a listed route, as documented in
    // docs/guide/caching/custom-routes.md ("Plugin routes"). Opt-in so it does
    // not change what the other specs see.
    ...(env.bool("CACHE_PLUGIN_USERS", false)
      ? [
          {
            contentType: "plugin::users-permissions.user",
            injectDefaultRoutes: false,
            routes: ["/api/users"],
          },
        ]
      : []),
    // Same, for a plugin that writes its content type through strapi.db.query
    // only, never through the document service.
    ...(env.bool("CACHE_PLUGIN_UPLOAD", false)
      ? [
          {
            contentType: "plugin::upload.file",
            injectDefaultRoutes: false,
            routes: ["/api/upload/files"],
          },
        ]
      : []),
    {
      contentType: "api::category.category",
      // Overridable so a test can tell it apart from the strategy's maxAge.
      // See https://github.com/strapi-community/plugin-rest-cache/issues/230
      maxAge: env.int("CATEGORY_MAX_AGE", 3600000),
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
        { path: "/api/categories/probe/buffer", method: "GET" },
        { path: "/api/categories/probe/throwing-body", method: "GET" },
        // No maxAge, hitpass or keys of its own: all three must come from
        // this content type, not from the strategy. See
        // https://github.com/strapi-community/plugin-rest-cache/issues/230
        {
          path: "/api/categories/probe/inherits",
          method: "GET",
          // Same switch: a listed route's undefined options inherit too.
          ...(env.bool("ARTICLE_EXPLICIT_UNDEFINED", false)
            ? { maxAge: undefined, hitpass: undefined }
            : {}),
        },
        {
          // The handler sets its own Cache-Control, chosen by ?value=, so the
          // query string has to be part of the key here.
          path: "/api/categories/probe/cache-control",
          method: "GET",
          keys: { useQueryParams: true, useHeaders: [], useAuth: true },
        },
        // Opt-in fixtures for purge patterns: an upper-case route path, and
        // one route per parameter form a purge pattern has to resolve.
        ...(env.bool("PURGE_ROUTE_FIXTURES", false)
          ? [
              { path: "/api/categories/bySlug/:slug", method: "GET" },
              { path: "/api/categories/echo/one/:slug", method: "GET" },
              { path: "/api/categories/echo/many/:slug+", method: "GET" },
              { path: "/api/categories/echo/maybe/:slug?", method: "GET" },
              { path: "/api/categories/echo/num/:id(\\d+)", method: "GET" },
              { path: "/api/categories/echo/code/:code(\\D+)", method: "GET" },
            ]
          : []),
        {
          // Keyed on a query param and two headers, so every separator in a
          // cache key is reachable from a request.
          path: "/api/categories/probe/vary",
          method: "GET",
          keys: { useQueryParams: ["q"], useHeaders: ["x-a", "x-b"], useAuth: true },
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
