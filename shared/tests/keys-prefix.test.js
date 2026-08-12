"use strict";

/**
 * Coverage for strategy.keysPrefix.
 *
 * The prefix changes how entries are stored and enumerated, not whether a
 * request hits or misses, so this asserts the storage-level behaviour directly
 * rather than re-running the whole behaviour suite once per prefix.
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const PREFIX = "my-custom-keyprefix";

describe("keysPrefix", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = PREFIX;
    await setup();
  });
  afterAll(async () => {
    delete process.env.KEYS_PREFIX;
    await teardown();
  });

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  it("caches and serves normally", async () => {
    const first = await agent().get("/api/homepage");
    const second = await agent().get("/api/homepage");

    expect(first.get("x-cache")).toBe("MISS");
    expect(second.get("x-cache")).toBe("HIT");
  });

  it("reports keys with the prefix stripped", async () => {
    await agent().get("/api/homepage");

    const keys = await strapi
      .plugin("rest-cache")
      .service("cacheStore")
      .keys();

    expect(keys.length).toBeGreaterThan(0);
    // cacheStore.keys() filters on the prefix and strips it, so callers see
    // logical keys. A leaked prefix here would break every purge regexp.
    for (const key of keys) {
      expect(key.startsWith(PREFIX)).toBe(false);
      expect(key.startsWith("/api/")).toBe(true);
    }
  });

  it("still purges when the content type changes", async () => {
    const first = await agent().get("/api/articles");
    const second = await agent().get("/api/articles");
    expect(first.get("x-cache")).toBe("MISS");
    expect(second.get("x-cache")).toBe("HIT");

    const [article] = await strapi
      .documents("api::article.article")
      .findMany({ status: "published", limit: 1 });

    await strapi.documents("api::article.article").update({
      documentId: article.documentId,
      data: { title: "Prefixed keys must still be purgeable" },
    });

    const third = await agent().get("/api/articles");
    expect(third.get("x-cache")).toBe("MISS");
  });

  it("clears every prefixed entry on reset", async () => {
    await agent().get("/api/homepage");
    await agent().get("/api/articles");

    const store = strapi.plugin("rest-cache").service("cacheStore");
    expect((await store.keys()).length).toBeGreaterThan(0);

    await store.reset();

    expect(await store.keys()).toHaveLength(0);
  });
});
