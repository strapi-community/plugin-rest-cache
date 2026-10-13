"use strict";

/**
 * A Buffer body must reach every caller as the bytes the handler sent.
 *
 * cacheStore.set serialises every body with JSON.stringify({ data }). A Buffer
 * stringifies to { type: "Buffer", data: [...] }, and JSON.parse never turns
 * that back into a Buffer, so every HIT used to serve that JSON object instead
 * of the original bytes - and without the Content-Type the handler set, which
 * is not stored either. A CSV export or a proxied file became a JSON array of
 * byte values for everyone after the first caller.
 *
 * Such a body is now refused by isCacheable, like a stream: returned as normal,
 * never stored.
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(60000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const store = () => strapi.plugin("rest-cache").service("cacheStore");

describe("Buffer bodies", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();
  });
  afterAll(async () => await teardown());

  beforeEach(() => store().reset());

  it("serves the same bytes and type to a second caller", async () => {
    const first = await agent().get("/api/categories/probe/buffer").buffer(true);
    const second = await agent().get("/api/categories/probe/buffer").buffer(true);

    expect(first.status).toBe(200);
    expect(first.get("x-cache")).toBe("MISS");
    expect(first.text).toBe("a,b\n1,2\n");
    expect(first.get("content-type")).toMatch(/^text\/csv/);

    expect(second.status).toBe(200);
    expect(second.text).toBe(first.text);
    expect(second.get("content-type")).toBe(first.get("content-type"));
    // Refused rather than stored, so the second caller reaches the origin.
    expect(second.get("x-cache")).toBe("MISS");
  });

  it("does not store anything for it", async () => {
    await agent().get("/api/categories/probe/buffer");

    const keys = await store().keys();
    expect(keys.filter((k) => k.includes("/categories/probe/buffer"))).toHaveLength(0);
  });
});
