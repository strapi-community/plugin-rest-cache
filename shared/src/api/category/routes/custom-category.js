"use strict";

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/categories/slug/:slug+",
      handler: "category.findBySlug",
    },
    // Fixture for a custom route whose configured path has upper-case
    // characters. Cache keys are lower-cased; purge patterns must match them.
    {
      method: "GET",
      path: "/categories/bySlug/:slug",
      handler: "category.findBySlug",
    },
    // Fixtures for purge patterns, one per parameter form: plain,
    // repeatable, optional and regex-constrained. The handler echoes, so any
    // value answers 200 and is cached without a matching row.
    {
      method: "GET",
      path: "/categories/echo/one/:slug",
      handler: "category.echo",
    },
    {
      method: "GET",
      path: "/categories/echo/many/:slug+",
      handler: "category.echo",
    },
    {
      method: "GET",
      path: "/categories/echo/maybe/:slug?",
      handler: "category.echo",
    },
    {
      method: "GET",
      path: "/categories/echo/num/:id(\\d+)",
      handler: "category.echo",
    },
    {
      method: "GET",
      path: "/categories/echo/code/:code(\\D+)",
      handler: "category.echo",
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
    // Fixture for a listed route inheriting its content type's options. See
    // https://github.com/strapi-community/plugin-rest-cache/issues/230
    {
      method: "GET",
      path: "/categories/probe/inherits",
      handler: "category.inherits",
    },
  ],
};
