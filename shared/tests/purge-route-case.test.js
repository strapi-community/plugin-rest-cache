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

describe("purge patterns for custom routes", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    process.env.CASE_ROUTE = "true";
    await setup();
  });
  afterAll(async () => {
    delete process.env.CASE_ROUTE;
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

    const purgeByParams = async (params) => {
      const regExps = strapi
        .plugin("rest-cache")
        .service("cacheConfig")
        .getCacheKeysRegexp(CATEGORY, params);
      await strapi.plugin("rest-cache").service("cacheStore").clearByRegexp(regExps);
    };

    const warmPath = async (path) => {
      await agent().get(path);
      const second = await agent().get(path);
      expect(second.get("x-cache")).toBe("HIT");
    };

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
});
