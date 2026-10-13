"use strict";

/**
 * Purge patterns are built from the configured route path verbatim, but cache
 * keys are built from the request path lower-cased (generateCacheKey). A custom
 * route configured with any upper-case character -
 * `/api/categories/bySlug/:slug` - is cached under `/api/categories/byslug/...`
 * and no purge pattern, not even a wildcard one, ever matches it. The entry
 * survives every write and every manual purge until maxAge.
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(60000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const CATEGORY = "api::category.category";
const PATH = "/api/categories/bySlug/news";

async function warm() {
  const first = await agent().get(PATH);
  const second = await agent().get(PATH);
  expect(first.status).toBe(200);
  expect(first.get("x-cache")).toBe("MISS");
  expect(second.get("x-cache")).toBe("HIT");
}

const purgeByParams = async (params, wildcard = false) => {
  const regExps = strapi
    .plugin("rest-cache")
    .service("cacheConfig")
    .getCacheKeysRegexp(CATEGORY, params, wildcard);
  await strapi.plugin("rest-cache").service("cacheStore").clearByRegexp(regExps);
};

const warmPath = async (path) => {
  const first = await agent().get(path);
  expect(first.status).toBe(200);
  const second = await agent().get(path);
  expect(second.get("x-cache")).toBe("HIT");
};

const cacheState = async (path) => (await agent().get(path)).get("x-cache");

describe("purge patterns for custom routes", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    process.env.PURGE_ROUTE_FIXTURES = "true";
    await setup();
  });
  afterAll(async () => {
    delete process.env.PURGE_ROUTE_FIXTURES;
    await teardown();
  });

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  it("purges it when the category is updated", async () => {
    await warm();

    const [news] = await strapi
      .documents(CATEGORY)
      .findMany({ filters: { slug: "news" }, limit: 1 });

    await strapi.documents(CATEGORY).update({
      documentId: news.documentId,
      data: { name: `News ${Date.now()}` },
    });

    const after = await agent().get(PATH);
    expect(after.get("x-cache")).toBe("MISS");
  });

  it("purges it on a wildcard purge of the content type", async () => {
    await warm();

    await strapi
      .plugin("rest-cache")
      .service("cacheStore")
      .clearByUid(CATEGORY, {}, true);

    const after = await agent().get(PATH);
    expect(after.get("x-cache")).toBe("MISS");
  });

  /**
   * The params a targeted purge substitutes into a route path are part of the
   * same pattern, so they have to be treated the way the key treats the request
   * path: lower-cased, and literal. A slug was interpolated as regexp source, so
   * `c++` threw "Nothing to repeat" out of the purge and `n.ws` also purged
   * `news`; and an upper-case slug never matched the lower-cased key it was
   * cached under.
   *
   * Driven through getCacheKeysRegexp + clearByRegexp rather than clearByUid:
   * with clearRelatedCache on, clearByUid always adds a wildcard purge of the
   * content type itself, which would hide whether the targeted pattern matched.
   */
  describe("purging a route by params", () => {
    // findBySlug answers 404 for an unknown slug, which is never cached, so
    // the slugs under test have to exist. Inserted below the document service
    // so that creating them purges nothing.
    beforeAll(async () => {
      for (const slug of ["News", "c++"]) {
        await strapi.db.query(CATEGORY).create({
          data: {
            name: `fixture ${slug}`,
            slug,
            documentId: `purgeroutecase${slug === "News" ? "upper" : "meta"}`,
            publishedAt: new Date(),
          },
        });
      }
    });

    it("purges the entry for an upper-case param value", async () => {
      // A route path that is already lower-case, so only the param is at stake.
      const path = "/api/categories/slug/News";
      await warmPath(path);

      await purgeByParams({ slug: "News" });

      const after = await agent().get(path);
      expect(after.get("x-cache")).toBe("MISS");
    });

    it("treats a param value with regexp metacharacters literally", async () => {
      const path = "/api/categories/slug/c++";
      await warmPath(path);

      await purgeByParams({ slug: "c++" });

      const after = await agent().get(path);
      expect(after.get("x-cache")).toBe("MISS");
    });

    it("does not let a metacharacter in a param purge other entries", async () => {
      await warmPath("/api/categories/slug/news");

      await purgeByParams({ slug: "n.ws" });

      const after = await agent().get("/api/categories/slug/news");
      expect(after.get("x-cache")).toBe("HIT");
    });
  });

  /**
   * Every parameter form path-to-regexp accepts has to turn into a pattern that
   * matches the keys the route actually stores. Each of these was a pattern
   * that matched nothing, or matched the wrong keys:
   * - `:slug+` was matched as a single segment, so `/many/a/b` never purged;
   * - `:slug?` left its `?` in the pattern, so a wildcard required the `/`
   *   the bare key does not have, and a targeted `abc` became `abc?`, which
   *   also purged `ab`;
   * - `:id(\\d+)` was used as regexp source to find itself, matched nothing,
   *   and stayed in the pattern as literal text.
   *
   * Wildcard and targeted patterns are tested separately, through
   * getCacheKeysRegexp + clearByRegexp, for the reason given above.
   */
  describe("parameter forms", () => {
    it("purges every segment of a repeatable param on a wildcard purge", async () => {
      await warmPath("/api/categories/echo/many/a/b");

      await purgeByParams({}, true);

      expect(await cacheState("/api/categories/echo/many/a/b")).toBe("MISS");
    });

    it("purges the bare path of an optional param on a wildcard purge", async () => {
      await warmPath("/api/categories/echo/maybe");
      await warmPath("/api/categories/echo/maybe/x");

      await purgeByParams({}, true);

      expect(await cacheState("/api/categories/echo/maybe")).toBe("MISS");
      expect(await cacheState("/api/categories/echo/maybe/x")).toBe("MISS");
    });

    it("purges only the given value of an optional param", async () => {
      await warmPath("/api/categories/echo/maybe/abc");
      await warmPath("/api/categories/echo/maybe/ab");

      await purgeByParams({ slug: "abc" });

      expect(await cacheState("/api/categories/echo/maybe/abc")).toBe("MISS");
      expect(await cacheState("/api/categories/echo/maybe/ab")).toBe("HIT");
    });

    it("purges a regex-constrained param on a wildcard purge", async () => {
      await warmPath("/api/categories/echo/num/42");

      await purgeByParams({}, true);

      expect(await cacheState("/api/categories/echo/num/42")).toBe("MISS");
    });

    // The constraint is kept in the wildcard pattern, which is lower-cased
    // afterwards. Lower-casing the letter of an escape would turn `\D` (not a
    // digit) into `\d` (a digit), and this entry would never be purged.
    it("keeps an escape in a constraint when lower-casing the pattern", async () => {
      await warmPath("/api/categories/echo/code/abc");

      await purgeByParams({}, true);

      expect(await cacheState("/api/categories/echo/code/abc")).toBe("MISS");
    });
  });

  /**
   * A key's path is the request path as it arrived: percent-encoded, then
   * lower-cased. Params are what code has to hand - the slug as stored, not
   * as a browser put it on the wire - so `café` and `a b` never matched the
   * `caf%c3%a9` and `a%20b` they were cached under.
   */
  describe("param values and URL encoding", () => {
    it("matches a non-ASCII value against its encoded key", async () => {
      await warmPath("/api/categories/echo/one/caf%C3%A9");

      await purgeByParams({ slug: "café" });

      expect(await cacheState("/api/categories/echo/one/caf%C3%A9")).toBe("MISS");
    });

    it("encodes an upper-case non-ASCII value before lower-casing it", async () => {
      // `É` is %C3%89. Lower-casing the character first would give `é`,
      // %C3%A9, which is a different key.
      await warmPath("/api/categories/echo/one/CAF%C3%89");

      await purgeByParams({ slug: "CAFÉ" });

      expect(await cacheState("/api/categories/echo/one/CAF%C3%89")).toBe("MISS");
    });

    it("matches a value with a space against its encoded key", async () => {
      await warmPath("/api/categories/echo/one/a%20b");

      await purgeByParams({ slug: "a b" });

      expect(await cacheState("/api/categories/echo/one/a%20b")).toBe("MISS");
    });

    it("still matches a value that is passed already encoded", async () => {
      await warmPath("/api/categories/echo/one/caf%C3%A9");

      await purgeByParams({ slug: "caf%C3%A9" });

      expect(await cacheState("/api/categories/echo/one/caf%C3%A9")).toBe("MISS");
    });

    // A string replacement reads `$&` as "the matched text", which would put
    // `:slug` back into the pattern and drop it as unresolved.
    it("inserts a value containing `$&` literally", async () => {
      await warmPath("/api/categories/echo/one/a$&b");

      await purgeByParams({ slug: "a$&b" });

      expect(await cacheState("/api/categories/echo/one/a$&b")).toBe("MISS");
    });
  });
});
