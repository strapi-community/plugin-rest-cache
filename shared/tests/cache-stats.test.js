"use strict";

/**
 * Coverage for the cache statistics endpoint backing the admin dashboard.
 *
 * See https://github.com/strapi-community/plugin-rest-cache/issues/114
 */

const { setup, teardown, agent, adminAgent } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

describe("cache stats", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();
  });
  afterAll(async () => await teardown());

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  it("requires authentication", async () => {
    const res = await agent().get("/rest-cache/stats");
    expect(res.status).toBe(401);
  });

  it("reports the provider and strategy", async () => {
    const res = await adminAgent().get("/rest-cache/stats");

    expect(res.status).toBe(200);
    expect(typeof res.body.provider.name).toBe("string");
    expect(res.body.strategy).toHaveProperty("enableDocumentServiceMiddleware");
    expect(res.body.strategy).toHaveProperty("clearRelatedCache");
  });

  it("reports zero entries for an empty cache", async () => {
    const res = await adminAgent().get("/rest-cache/stats");

    expect(res.body.totals.entries).toBe(0);
    expect(res.body.totals.contentTypes).toBeGreaterThan(0);
  });

  it("counts entries per content type", async () => {
    await agent().get("/api/articles");
    await agent().get("/api/homepage");

    const res = await adminAgent().get("/rest-cache/stats");

    const article = res.body.contentTypes.find(
      (c) => c.uid === "api::article.article"
    );
    const homepage = res.body.contentTypes.find(
      (c) => c.uid === "api::homepage.homepage"
    );

    expect(article.entries).toBeGreaterThan(0);
    expect(homepage.entries).toBeGreaterThan(0);
  });

  it("does not count etag companions as entries", async () => {
    await agent().get("/api/articles");

    const res = await adminAgent().get("/rest-cache/stats");
    const keys = await strapi.plugin("rest-cache").service("cacheStore").keys();

    // ETag is enabled in the playground, so the raw key count is double.
    expect(res.body.totals.etags).toBeGreaterThan(0);
    expect(res.body.totals.entries + res.body.totals.etags).toBe(keys.length);
  });

  it("surfaces per-content-type configuration", async () => {
    const res = await adminAgent().get("/rest-cache/stats");

    const category = res.body.contentTypes.find(
      (c) => c.uid === "api::category.category"
    );

    // category is the one configured with hitpass off and identity keying.
    expect(category.hitpass).toBe(false);
    expect(category.keysAuthIdentity).toBe(true);
    expect(category.routes).toContain("/api/categories");
  });

  it("reflects a purge", async () => {
    await agent().get("/api/articles");
    const before = await adminAgent().get("/rest-cache/stats");
    expect(before.body.totals.entries).toBeGreaterThan(0);

    await strapi.plugin("rest-cache").service("cacheStore").reset();

    const after = await adminAgent().get("/rest-cache/stats");
    expect(after.body.totals.entries).toBe(0);
  });
});
