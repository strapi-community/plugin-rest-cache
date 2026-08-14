"use strict";

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/categories/slug/:slug+",
      handler: "category.findBySlug",
    },
    // Fixtures for responses the cache must refuse to buffer. See
    // https://github.com/strapi-community/plugin-rest-cache/issues/133
    {
      method: "GET",
      path: "/categories/probe/raw",
      handler: "category.raw",
    },
    {
      method: "GET",
      path: "/categories/probe/stream",
      handler: "category.stream",
    },
    {
      method: "GET",
      path: "/categories/probe/with-cookie",
      handler: "category.withCookie",
    },
    // Fixture for a handler that sets Cache-Control itself, which the plugin
    // must never overwrite. See
    // https://github.com/strapi-community/plugin-rest-cache/issues/175
    {
      method: "GET",
      path: "/categories/probe/cache-control",
      handler: "category.withCacheControl",
    },
  ],
};
