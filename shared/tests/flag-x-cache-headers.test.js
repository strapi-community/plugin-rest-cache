"use strict";

/**
 * Coverage for strategy flags that change how invalidation behaves.
 *
 * Each block boots its own Strapi instance because these flags are read once,
 * at register time.
 */

const { setup, teardown, agent, adminAgent } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;


describe("enableXCacheHeaders: false", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    process.env.ENABLE_XCACHE_HEADERS = "false";
    await setup();
  });
  afterAll(async () => {
    delete process.env.ENABLE_XCACHE_HEADERS;
    await teardown();
  });

  it("still caches but emits no X-Cache header", async () => {
    const first = await agent().get("/api/articles");
    const second = await agent().get("/api/articles");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.get("x-cache")).toBeUndefined();
    expect(second.get("x-cache")).toBeUndefined();

    // The bodies must still match, proving the second was served from cache
    // even though the header is suppressed.
    expect(JSON.stringify(first.body)).toBe(JSON.stringify(second.body));
  });
});
