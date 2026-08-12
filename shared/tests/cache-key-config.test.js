"use strict";

/**
 * Coverage for the cache-key configuration surface.
 *
 * The shared strategy (shared/config/cache-strategy.js) configures a custom
 * route, per-route maxAge and keys overrides, header-based keying and an
 * explicit useQueryParams allow-list - none of which had any test coverage.
 *
 * `api::category.category` is the interesting one:
 *
 *   keys:    { useQueryParams: false, useHeaders: ["accept-encoding"] }
 *   hitpass: false                       (overrides the global hitpass)
 *   routes:  /api/categories/slug/:slug+ with
 *            keys   { useQueryParams: ["populate", "locale"], useHeaders: [] }
 *            maxAge 18000
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(60000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

describe("cache key configuration", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();
  });
  afterAll(async () => await teardown());

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  describe("useQueryParams: false", () => {
    it("ignores query params entirely when building the key", async () => {
      const first = await agent().get("/api/categories");
      const second = await agent().get("/api/categories?populate=*&sort=name");

      expect(first.get("x-cache")).toBe("MISS");
      // category is configured with useQueryParams: false, so a different
      // query string must resolve to the same cache entry.
      expect(second.get("x-cache")).toBe("HIT");
    });
  });

  describe("useHeaders (vary)", () => {
    it("stores separate entries per configured header value", async () => {
      const first = await agent()
        .get("/api/categories")
        .set("Accept-Encoding", "gzip");
      const second = await agent()
        .get("/api/categories")
        .set("Accept-Encoding", "br");

      expect(first.get("x-cache")).toBe("MISS");
      expect(second.get("x-cache")).toBe("MISS");
    });

    it("reuses the entry when the configured header matches", async () => {
      const first = await agent()
        .get("/api/categories")
        .set("Accept-Encoding", "gzip");
      const second = await agent()
        .get("/api/categories")
        .set("Accept-Encoding", "gzip");

      expect(first.get("x-cache")).toBe("MISS");
      expect(second.get("x-cache")).toBe("HIT");
    });

    it("ignores headers that are not configured", async () => {
      const first = await agent()
        .get("/api/categories")
        .set("Accept-Encoding", "gzip")
        .set("X-Custom", "one");
      const second = await agent()
        .get("/api/categories")
        .set("Accept-Encoding", "gzip")
        .set("X-Custom", "two");

      expect(first.get("x-cache")).toBe("MISS");
      expect(second.get("x-cache")).toBe("HIT");
    });
  });

  describe("custom route with an explicit useQueryParams allow-list", () => {
    it("caches a custom route", async () => {
      const first = await agent().get("/api/categories/slug/news");
      const second = await agent().get("/api/categories/slug/news");

      expect(first.status).toBe(200);
      expect(second.get("x-cache")).toBe("HIT");
    });

    it("keys separately on an allow-listed query param", async () => {
      const first = await agent().get("/api/categories/slug/news");
      const second = await agent().get(
        "/api/categories/slug/news?populate=articles"
      );

      expect(first.get("x-cache")).toBe("MISS");
      // `populate` is in the allow-list, so it must produce a distinct entry.
      expect(second.get("x-cache")).toBe("MISS");
    });

    it("ignores query params outside the allow-list", async () => {
      const first = await agent().get("/api/categories/slug/news");
      const second = await agent().get("/api/categories/slug/news?sort=name");

      expect(first.get("x-cache")).toBe("MISS");
      // `sort` is not allow-listed, so it must not affect the key.
      expect(second.get("x-cache")).toBe("HIT");
    });

    it("keys separately per route param", async () => {
      const first = await agent().get("/api/categories/slug/news");
      const second = await agent().get("/api/categories/slug/tech");

      expect(first.get("x-cache")).toBe("MISS");
      expect(second.get("x-cache")).toBe("MISS");
    });

    it("purges the custom route when the content type changes", async () => {
      const warm = await agent().get("/api/categories/slug/news");
      const hit = await agent().get("/api/categories/slug/news");
      expect(warm.get("x-cache")).toBe("MISS");
      expect(hit.get("x-cache")).toBe("HIT");

      const [category] = await strapi
        .documents("api::category.category")
        .findMany({ filters: { slug: "news" }, limit: 1 });

      await strapi.documents("api::category.category").update({
        documentId: category.documentId,
        data: { name: "news updated" },
      });

      const after = await agent().get("/api/categories/slug/news");
      expect(after.get("x-cache")).toBe("MISS");
    });
  });

  describe("per-contentType hitpass override", () => {
    // The default hitpass triggers on an `authorization` OR a `cookie` header.
    // We use `cookie` here deliberately: an invalid bearer token is rejected by
    // Strapi's authenticate middleware, which runs BEFORE route middlewares, so
    // the cache middleware would never execute and the assertion would be
    // meaningless.
    const SESSION = "session=abc123";

    it("caches requests carrying a cookie when hitpass is disabled for the type", async () => {
      // api::category.category sets hitpass: false, overriding the global
      // hitpass, so it must still cache.
      const first = await agent().get("/api/categories").set("Cookie", SESSION);
      const second = await agent().get("/api/categories").set("Cookie", SESSION);

      expect(first.get("x-cache")).toBe("MISS");
      expect(second.get("x-cache")).toBe("HIT");
    });

    it("bypasses the cache for a content type using the default hitpass", async () => {
      // api::article.article inherits the global hitpass.
      const first = await agent().get("/api/articles").set("Cookie", SESSION);
      const second = await agent().get("/api/articles").set("Cookie", SESSION);

      expect(first.get("x-cache")).toBe("HITPASS");
      expect(second.get("x-cache")).toBe("HITPASS");
    });

    it("does not let a hitpass request populate the cache for anonymous users", async () => {
      await agent().get("/api/articles").set("Cookie", SESSION);

      const anonymous = await agent().get("/api/articles");

      expect(anonymous.get("x-cache")).toBe("MISS");
    });

    it("does not serve a cached entry to a hitpass request", async () => {
      const warm = await agent().get("/api/articles");
      const hit = await agent().get("/api/articles");
      expect(warm.get("x-cache")).toBe("MISS");
      expect(hit.get("x-cache")).toBe("HIT");

      const authed = await agent().get("/api/articles").set("Cookie", SESSION);
      expect(authed.get("x-cache")).toBe("HITPASS");
    });
  });
});
