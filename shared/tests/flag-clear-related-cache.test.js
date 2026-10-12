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

const ARTICLE = "api::article.article";

async function warmArticleCache() {
  const first = await agent().get("/api/articles");
  const second = await agent().get("/api/articles");

  expect(first.get("x-cache")).toBe("MISS");
  expect(second.get("x-cache")).toBe("HIT");
}


describe("clearRelatedCache: false", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    process.env.CLEAR_RELATED_CACHE = "false";
    await setup();
  });
  afterAll(async () => {
    delete process.env.CLEAR_RELATED_CACHE;
    await teardown();
  });

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  it("purges only the written content type", async () => {
    const homepageFirst = await agent().get("/api/homepage");
    const homepageSecond = await agent().get("/api/homepage");
    expect(homepageFirst.get("x-cache")).toBe("MISS");
    expect(homepageSecond.get("x-cache")).toBe("HIT");

    await warmArticleCache();

    const [article] = await strapi
      .documents(ARTICLE)
      .findMany({ status: "published", limit: 1 });

    await strapi.documents(ARTICLE).update({
      documentId: article.documentId,
      data: { title: "Related caches must survive" },
    });

    // article is cleared...
    const articleAfter = await agent().get("/api/articles");
    expect(articleAfter.get("x-cache")).toBe("MISS");

    // ...but homepage, which is only related, is not.
    const homepageAfter = await agent().get("/api/homepage");
    expect(homepageAfter.get("x-cache")).toBe("HIT");
  });
});

describe("clearRelatedCache: true", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    process.env.CLEAR_RELATED_CACHE = "true";
    await setup();
  });
  afterAll(async () => {
    delete process.env.CLEAR_RELATED_CACHE;
    await teardown();
  });

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  // page reaches article only through a component inside a dynamic zone.
  // See https://github.com/strapi-community/plugin-rest-cache/issues/232
  it("purges a content type related through a dynamic zone", async () => {
    const pageFirst = await agent().get("/api/pages");
    const pageSecond = await agent().get("/api/pages");
    expect(pageFirst.status).toBe(200);
    expect(pageFirst.get("x-cache")).toBe("MISS");
    expect(pageSecond.get("x-cache")).toBe("HIT");

    const [article] = await strapi
      .documents(ARTICLE)
      .findMany({ status: "published", limit: 1 });

    await strapi.documents(ARTICLE).update({
      documentId: article.documentId,
      data: { title: "Related caches must be purged" },
    });

    const pageAfter = await agent().get("/api/pages");
    expect(pageAfter.get("x-cache")).toBe("MISS");
  });
});
