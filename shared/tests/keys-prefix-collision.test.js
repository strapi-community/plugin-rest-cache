"use strict";

/**
 * Coverage for a keysPrefix that also occurs inside the cache keys.
 *
 * cacheStore.keys() already strips the prefix, so the keys every caller sees
 * are logical ones. clearByRegexp then stripped it a second time, with a plain
 * String.replace - which removes the first occurrence anywhere in the string,
 * not an anchored prefix.
 *
 * With a prefix that never appears in a route path the second strip is a no-op
 * and nothing looks wrong, which is why keys-prefix.test.js does not catch it.
 * With a prefix like "api", the logical key "/api/articles?..." becomes
 * "//articles?..." before it is matched, no purge regexp matches it, and the
 * entry survives every purge until it expires on maxAge.
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

// Deliberately a substring of every cached route path.
const PREFIX = "api";

describe("keysPrefix that collides with the route path", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = PREFIX;
    await setup();
  });
  afterAll(async () => {
    delete process.env.KEYS_PREFIX;
    await teardown();
  });

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  it("still reports keys with only the leading prefix removed", async () => {
    await agent().get("/api/articles");

    const keys = await strapi.plugin("rest-cache").service("cacheStore").keys();

    expect(keys.length).toBeGreaterThan(0);
    // "/api/articles?..." must survive intact - the prefix is stripped from the
    // front, not from wherever "api" happens to appear.
    for (const key of keys) {
      expect(key.startsWith("/api/")).toBe(true);
    }
  });

  it("purges on write", async () => {
    const first = await agent().get("/api/articles");
    const second = await agent().get("/api/articles");
    expect(first.get("x-cache")).toBe("MISS");
    expect(second.get("x-cache")).toBe("HIT");

    const [article] = await strapi
      .documents("api::article.article")
      .findMany({ status: "published", limit: 1 });

    await strapi.documents("api::article.article").update({
      documentId: article.documentId,
      data: { title: "A colliding prefix must not defeat the purge" },
    });

    const third = await agent().get("/api/articles");
    expect(third.get("x-cache")).toBe("MISS");
  });

  it("removes the entry from the store, not just from the response", async () => {
    await agent().get("/api/articles");

    const store = strapi.plugin("rest-cache").service("cacheStore");
    expect((await store.keys()).length).toBeGreaterThan(0);

    await store.clearByUid("api::article.article", {}, true);

    const remaining = (await store.keys()).filter((key) =>
      key.startsWith("/api/articles?")
    );
    expect(remaining).toHaveLength(0);
  });
});
