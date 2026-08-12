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


describe("enableEtag: false", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    process.env.ENABLE_ETAG = "false";
    await setup();
  });
  afterAll(async () => {
    delete process.env.ENABLE_ETAG;
    await teardown();
  });

  it("does not emit an ETag and never returns 304", async () => {
    const first = await agent().get("/api/articles");
    expect(first.get("etag")).toBeUndefined();

    const second = await agent()
      .get("/api/articles")
      .set("If-None-Match", '"anything"');

    expect(second.status).toBe(200);
    expect(second.get("x-cache")).toBe("HIT");
  });
});
