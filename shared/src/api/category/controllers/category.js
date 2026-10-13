"use strict";

/**
 *  category controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

/**
 * Optional origin latency, chosen by `?delay=` (milliseconds), so a test can
 * hold the origin open while concurrent requests pile up behind it.
 */
const originDelay = (ctx) =>
  new Promise((resolve) => setTimeout(resolve, Number(ctx.query.delay) || 0));

module.exports = createCoreController(
  "api::category.category",
  ({ strapi }) => ({
    /**
     * Writes straight to the raw socket, the way Strapi's own /mcp route does.
     * Koa is told not to handle the response at all.
     */
    async raw(ctx) {
      await originDelay(ctx);
      ctx.respond = false;
      ctx.res.statusCode = 200;
      ctx.res.setHeader("Content-Type", "application/json");
      ctx.res.end(JSON.stringify({ raw: true }));
    },

    /** A streamed body, which cannot be serialised into a cache entry. */
    /**
     * A body that throws when the cache inspects it, so the cacheability
     * verdict itself fails while concurrent requests wait on this one.
     */
    async throwingBody(ctx) {
      await originDelay(ctx);
      ctx.body = {
        get pipe() {
          throw new Error("body inspection failed");
        },
      };
    },

    async stream(ctx) {
      await originDelay(ctx);
      const { Readable } = require("stream");
      ctx.type = "application/json";
      ctx.body = Readable.from([JSON.stringify({ streamed: true })]);
    },

    /** A Buffer body with its own content type, e.g. a proxied file. */
    async buffer(ctx) {
      ctx.type = "text/csv";
      ctx.body = Buffer.from("a,b\n1,2\n");
    },

    /** A response carrying a Set-Cookie, which must never be shared. */
    async withCookie(ctx) {
      await originDelay(ctx);
      ctx.cookies.set("session", `s-${Date.now()}`, { httpOnly: true });
      ctx.body = { cookie: true };
    },

    /**
     * A handler that states its own caching policy. `?value=` picks it, so one
     * fixture covers both a directive that stops the plugin storing the
     * response (`no-store`) and one that does not (`max-age=99`).
     */
    async withCacheControl(ctx) {
      await originDelay(ctx);
      ctx.set("Cache-Control", String(ctx.query.value || "no-store"));
      // Echoes a per-caller header: the kind of response a handler marks
      // private because it differs per caller.
      ctx.body = { handlerSetCacheControl: true, caller: ctx.get("x-caller") };
    },

    /**
     * A plain response for a route listed under the content type with no
     * options of its own, so everything it gets is inherited. See
     * https://github.com/strapi-community/plugin-rest-cache/issues/230
     */
    async inherits(ctx) {
      ctx.body = { inherits: true, at: Date.now() };
    },

    /**
     * Answers any parameters with 200, so purge-pattern fixtures can cache a
     * value without a row to back it.
     */
    async echo(ctx) {
      ctx.body = { params: ctx.params, at: Date.now() };
    },

    /**
     * Echoes everything its cache key is built from, so a response served
     * under another request's key is visible in the body.
     */
    async vary(ctx) {
      ctx.body = {
        q: ctx.query.q ?? null,
        a: ctx.get("x-a") || null,
        b: ctx.get("x-b") || null,
      };
    },

    async findBySlug(ctx) {
      const { slug } = ctx.params;
      const { query } = ctx;

      let populate;
      if (query.populate) {
        if (query.populate === "*") {
          populate = true;
        } else {
          populate = query.populate.split(",");
        }
      }

      const category = await strapi.db.query("api::category.category").findOne({
        where: {
          slug,
        },
        populate,
      });

      const sanitizedEntity = await this.sanitizeOutput(category, ctx);

      return this.transformResponse(sanitizedEntity);
    },
  })
);
