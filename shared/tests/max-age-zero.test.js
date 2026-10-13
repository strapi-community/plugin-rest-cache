"use strict";

/**
 * `maxAge: 0` means "do not cache".
 *
 * keyv and cache-manager read a ttl of 0 as "no expiry", so a route configured
 * with maxAge 0 was stored forever - while, with cacheControl enabled, the same
 * response told clients `max-age=0`. A route that asks for no lifetime gets
 * no entry.
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(60000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const ROUTE = "/api/categories/probe/inherits";

describe("maxAge: 0", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    // category's maxAge, which its listed /probe/inherits route takes.
    process.env.CATEGORY_MAX_AGE = "0";
    await setup();
  });
  afterAll(async () => {
    delete process.env.CATEGORY_MAX_AGE;
    await teardown();
  });

  const store = () => strapi.plugin("rest-cache").service("cacheStore");

  beforeEach(() => store().reset());

  it("does not serve a route with maxAge 0 from the cache", async () => {
    const first = await agent().get(ROUTE);
    const second = await agent().get(ROUTE);

    expect(first.status).toBe(200);
    expect(first.get("x-cache")).toBe("MISS");
    expect(second.get("x-cache")).toBe("MISS");
  });

  it("stores nothing for it", async () => {
    await agent().get(ROUTE);

    const keys = (await store().keys()).filter((k) => k.startsWith(ROUTE));
    expect(keys).toEqual([]);
  });

  it("does not store through cacheStore.set with maxAge 0 either", async () => {
    await store().set("/api/direct-zero?", { a: 1 }, 0);

    expect(await store().get("/api/direct-zero?")).toBeNull();
  });

  it("still caches routes with a positive maxAge", async () => {
    await agent().get("/api/articles");
    const second = await agent().get("/api/articles");

    expect(second.get("x-cache")).toBe("HIT");
  });
});
