"use strict";

/**
 * An option whose value is undefined must inherit exactly like an omitted one.
 *
 * resolveUserStrategy spread `...contentTypeOption` (and a listed route's own
 * options) over the inherited values, so a key that was present but undefined
 * overwrote what it should have inherited. The config classes then fell back
 * to their hard-coded defaults: maxAge 3600000, hitpass false, and - for
 * injectDefaultRoutes - no routes at all. `maxAge: env.int("UNSET")` is the
 * everyday way to produce this, and hitpass false caches cookie-carrying
 * requests, so one caller was served another's response.
 *
 * The fixture sets maxAge, hitpass and injectDefaultRoutes to undefined on the
 * article entry, and maxAge / hitpass to undefined on category's listed
 * /probe/inherits route, behind ARTICLE_EXPLICIT_UNDEFINED.
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const STRATEGY_MAX_AGE = 60000;
// Distinct from the strategy and from the classes' hard-coded 3600000, so the
// source of a listed route's maxAge is visible.
const CATEGORY_MAX_AGE = 120000;

describe("options set to undefined", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    process.env.ARTICLE_EXPLICIT_UNDEFINED = "true";
    process.env.ENABLE_MAX_AGE = String(STRATEGY_MAX_AGE);
    process.env.CATEGORY_MAX_AGE = String(CATEGORY_MAX_AGE);
    await setup();
  });

  afterAll(async () => {
    delete process.env.ARTICLE_EXPLICIT_UNDEFINED;
    delete process.env.ENABLE_MAX_AGE;
    delete process.env.CATEGORY_MAX_AGE;
    await teardown();
  });

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  const route = (uid, path) =>
    strapi
      .plugin("rest-cache")
      .service("cacheConfig")
      .get(uid)
      .routes.find((r) => r.method === "GET" && r.path === path);

  it("still injects the default routes", () => {
    expect(route("api::article.article", "/api/articles")).toBeDefined();
  });

  it("default routes inherit the strategy maxAge", () => {
    expect(route("api::article.article", "/api/articles").maxAge).toBe(STRATEGY_MAX_AGE);
  });

  it("default routes inherit the strategy hitpass, so cookie requests bypass", async () => {
    const alice = await agent().get("/api/articles").set("Cookie", "session=alice");
    const bob = await agent().get("/api/articles").set("Cookie", "session=bob");

    expect(alice.status).toBe(200);
    // Inheriting the hard-coded hitpass: false gave ["MISS", "HIT"]: bob was
    // served alice's response.
    expect([alice.get("x-cache"), bob.get("x-cache")]).toEqual(["HITPASS", "HITPASS"]);
  });

  it("a listed route's undefined maxAge inherits from its content type", () => {
    const listed = route("api::category.category", "/api/categories/probe/inherits");
    expect(listed.maxAge).toBe(CATEGORY_MAX_AGE);
  });
});

describe("a listed route's undefined hitpass, under a content type without useAuth", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    process.env.ARTICLE_EXPLICIT_UNDEFINED = "true";
    // category keeps hitpass: false but nothing keys on the caller, so the
    // listed route must keep the strategy's bypass (#230) - unless an undefined
    // hitpass on the route overrode that with a hard-coded false.
    process.env.CATEGORY_USE_AUTH = "false";
    await setup();
  });

  afterAll(async () => {
    delete process.env.ARTICLE_EXPLICIT_UNDEFINED;
    delete process.env.CATEGORY_USE_AUTH;
    await teardown();
  });

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  it("keeps bypassing cookie requests, as when the option is omitted", async () => {
    const alice = await agent().get("/api/categories/probe/inherits").set("Cookie", "s=alice");
    const bob = await agent().get("/api/categories/probe/inherits").set("Cookie", "s=bob");

    expect(alice.status).toBe(200);
    expect([alice.get("x-cache"), bob.get("x-cache")]).toEqual(["HITPASS", "HITPASS"]);
  });
});
