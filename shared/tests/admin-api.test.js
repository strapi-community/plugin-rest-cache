"use strict";

/**
 * Coverage for the plugin's admin API.
 *
 * These endpoints back the admin panel's purge button and strategy view, and
 * had no test coverage at all. That gap is not theoretical: PR #122 proposed
 * moving the admin client to `/admin/rest-cache/*`, which would have broken
 * both endpoints, and nothing in the suite would have caught it.
 *
 * Plugin routes of type `admin` mount at `/<pluginName>` with no `/admin`
 * prefix, so these live at `/rest-cache/*`.
 */

const { setup, teardown, agent, adminAgent } = require("./helpers/strapi");

jest.setTimeout(60000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

describe("admin api", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();
  });
  afterAll(async () => await teardown());

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  describe("route mounting", () => {
    it.each([
      ["GET", "/rest-cache/config/strategy"],
      ["GET", "/rest-cache/config/provider"],
      ["POST", "/rest-cache/purge"],
    ])("mounts %s %s and requires authentication", async (method, path) => {
      const res = await agent()[method.toLowerCase()](path);

      // 401 proves the route exists but rejected us. A 404 would mean it was
      // never mounted.
      expect(res.status).toBe(401);
    });

    it("does not mount the endpoints under /admin", async () => {
      // Guards against reintroducing the /admin prefix. Note an unmatched
      // /admin/* GET falls through to the admin panel SPA and returns 200 with
      // an HTML body, so assert on the content type rather than the status.
      const res = await agent().get("/admin/rest-cache/config/strategy");

      expect(res.type).not.toBe("application/json");
    });
  });

  describe("GET /rest-cache/config/strategy", () => {
    it("returns the resolved strategy", async () => {
      const res = await adminAgent().get("/rest-cache/config/strategy");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("strategy");
      expect(Array.isArray(res.body.strategy.contentTypes)).toBe(true);
    });

    it("reports the resolved routes for a cached content type", async () => {
      const res = await adminAgent().get("/rest-cache/config/strategy");

      const article = res.body.strategy.contentTypes.find(
        (conf) => conf.contentType === "api::article.article"
      );

      expect(article).toBeDefined();
      expect(article.routes.map((route) => route.path)).toContain(
        "/api/articles"
      );
    });
  });

  describe("GET /rest-cache/config/provider", () => {
    it("returns the provider configuration", async () => {
      const res = await adminAgent().get("/rest-cache/config/provider");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("provider");
      expect(typeof res.body.provider.name).toBe("string");
    });

    it("does not return the provider's options", async () => {
      const res = await adminAgent().get("/rest-cache/config/provider");

      // `options` is passed straight to the adapter, and for redis that is
      // where connection details live - @keyv/redis accepts a full
      // "redis://user:password@host" URI there. Nothing in the admin panel
      // needs it, and every admin holding cache.read-provider is not
      // necessarily someone who should read infrastructure credentials.
      //
      // cacheStats.summary() already exposes only the name for this reason;
      // this endpoint used to return the whole object.
      expect(res.body.provider).not.toHaveProperty("options");
    });
  });

  describe("POST /rest-cache/purge", () => {
    it("rejects a request with no contentType", async () => {
      const res = await adminAgent().post("/rest-cache/purge").send({});

      expect(res.status).toBe(400);
    });

    it("rejects a contentType that is not cached", async () => {
      const res = await adminAgent()
        .post("/rest-cache/purge")
        .send({ contentType: "api::writer.writer" });

      expect(res.status).toBe(400);
    });

    it("purges every entry for a cached content type", async () => {
      const first = await agent().get("/api/articles");
      const second = await agent().get("/api/articles");
      expect(first.get("x-cache")).toBe("MISS");
      expect(second.get("x-cache")).toBe("HIT");

      const purge = await adminAgent()
        .post("/rest-cache/purge")
        .send({ contentType: "api::article.article" });
      expect(purge.status).toBe(200);

      const third = await agent().get("/api/articles");
      expect(third.get("x-cache")).toBe("MISS");
    });

    it("purges a single entry when given route params", async () => {
      const [article] = await strapi
        .documents("api::article.article")
        .findMany({ status: "published", limit: 1 });

      const list = await agent().get("/api/articles");
      const entry = await agent().get(`/api/articles/${article.documentId}`);
      expect(list.get("x-cache")).toBe("MISS");
      expect(entry.get("x-cache")).toBe("MISS");

      await adminAgent()
        .post("/rest-cache/purge")
        .send({
          contentType: "api::article.article",
          params: { id: article.documentId },
        });

      const entryAfter = await agent().get(
        `/api/articles/${article.documentId}`
      );
      expect(entryAfter.get("x-cache")).toBe("MISS");
    });

    it("purges all entries of a route when wildcard is set", async () => {
      const [one, two] = await strapi
        .documents("api::article.article")
        .findMany({ status: "published", limit: 2 });

      await agent().get(`/api/articles/${one.documentId}`);
      await agent().get(`/api/articles/${two.documentId}`);

      expect(
        (await agent().get(`/api/articles/${one.documentId}`)).get("x-cache")
      ).toBe("HIT");
      expect(
        (await agent().get(`/api/articles/${two.documentId}`)).get("x-cache")
      ).toBe("HIT");

      await adminAgent()
        .post("/rest-cache/purge")
        .send({ contentType: "api::article.article", wildcard: true });

      expect(
        (await agent().get(`/api/articles/${one.documentId}`)).get("x-cache")
      ).toBe("MISS");
      expect(
        (await agent().get(`/api/articles/${two.documentId}`)).get("x-cache")
      ).toBe("MISS");
    });
  });
});
