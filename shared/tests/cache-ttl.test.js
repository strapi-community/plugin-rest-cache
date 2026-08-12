"use strict";

/**
 * Coverage for cache entry expiry.
 *
 * `maxAge` is milliseconds throughout the plugin (the documented default is
 * 3600000 = 1 hour). A cached entry must therefore expire `maxAge` milliseconds
 * after it is stored.
 *
 * See https://github.com/strapi-community/plugin-rest-cache/issues/126
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(60000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const MAX_AGE_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("cache ttl", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    // shared/config/cache-strategy.js reads the default maxAge from this var
    process.env.ENABLE_MAX_AGE = String(MAX_AGE_MS);
    await setup();
  });
  afterAll(async () => {
    delete process.env.ENABLE_MAX_AGE;
    await teardown();
  });

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  it("serves from cache before maxAge elapses", async () => {
    await agent().get("/api/homepage");
    await sleep(MAX_AGE_MS / 4);
    const second = await agent().get("/api/homepage");

    expect(second.get("x-cache")).toBe("HIT");
  });

  it("expires the entry once maxAge has elapsed", async () => {
    const first = await agent().get("/api/homepage");
    expect(first.get("x-cache")).toBe("MISS");

    await sleep(MAX_AGE_MS * 1.5);

    const second = await agent().get("/api/homepage");
    expect(second.get("x-cache")).toBe("MISS");
  });
});
