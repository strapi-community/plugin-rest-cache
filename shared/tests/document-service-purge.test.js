"use strict";

/**
 * Coverage for cache invalidation on writes that never traverse an HTTP route.
 *
 * The plugin historically purged by injecting Koa middleware onto content-api
 * and content-manager write routes. Anything writing through the document
 * service directly - scheduled Content Releases, review-workflow transitions,
 * GraphQL mutations, custom services, cron jobs, seed scripts - left the cache
 * stale with no signal.
 *
 * See https://github.com/strapi-community/plugin-rest-cache/issues/129
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(60000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const UID = "api::article.article";

async function warmArticleCache() {
  const first = await agent().get("/api/articles");
  const second = await agent().get("/api/articles");

  expect(first.get("x-cache")).toBe("MISS");
  expect(second.get("x-cache")).toBe("HIT");
}

describe("document service purge", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();
  });
  afterAll(async () => await teardown());

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  it("purges when a document is updated outside of any HTTP request", async () => {
    const [article] = await strapi
      .documents(UID)
      .findMany({ status: "published", limit: 1 });

    await warmArticleCache();

    await strapi.documents(UID).update({
      documentId: article.documentId,
      data: { title: "Updated by a background job" },
    });

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("MISS");
  });

  it("purges when a document is published outside of any HTTP request", async () => {
    const [draft] = await strapi
      .documents(UID)
      .findMany({ status: "draft", limit: 1 });

    await warmArticleCache();

    await strapi.documents(UID).publish({ documentId: draft.documentId });

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("MISS");
  });

  it("purges when a document is unpublished outside of any HTTP request", async () => {
    const [article] = await strapi
      .documents(UID)
      .findMany({ status: "published", limit: 1 });

    await warmArticleCache();

    await strapi.documents(UID).unpublish({ documentId: article.documentId });

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("MISS");
  });

  it("purges when a document is created outside of any HTTP request", async () => {
    await warmArticleCache();

    await strapi.documents(UID).create({
      data: {
        title: "Created by a background job",
        description: "Created outside of any HTTP request",
        content: "Body copy.",
        slug: "created-by-a-job",
      },
      status: "published",
    });

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("MISS");
  });

  it("purges when a document is deleted outside of any HTTP request", async () => {
    const [article] = await strapi
      .documents(UID)
      .findMany({ status: "published", limit: 1 });

    await warmArticleCache();

    await strapi.documents(UID).delete({ documentId: article.documentId });

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("MISS");
  });

  it("does not purge on reads", async () => {
    await warmArticleCache();

    // The document service middleware runs for reads too. If we purged on them,
    // every cache hit would immediately invalidate itself.
    await strapi.documents(UID).findMany({ status: "published" });
    await strapi.documents(UID).findFirst({ status: "published" });

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("HIT");
  });

  it("does not purge cached content types unrelated to the write", async () => {
    // `homepage` has no relation to `article`, so writing to it must leave the
    // article cache intact. Note the reverse is NOT true: `article` is related
    // to every other cached type in this playground via the
    // shared.seo -> sections.highlight -> article component chain, so writing
    // an article legitimately purges everything (see the next test).
    await warmArticleCache();

    const [homepage] = await strapi
      .documents("api::homepage.homepage")
      .findMany({ limit: 1 });

    await strapi.documents("api::homepage.homepage").update({
      documentId: homepage.documentId,
      data: { seo: { metaTitle: "Unrelated edit" } },
    });

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("HIT");
  });

  it("purges related content types when clearRelatedCache is enabled", async () => {
    // `homepage` embeds article data through the sections.highlight component,
    // so an article write has to invalidate the homepage too.
    const first = await agent().get("/api/homepage");
    const second = await agent().get("/api/homepage");
    expect(first.get("x-cache")).toBe("MISS");
    expect(second.get("x-cache")).toBe("HIT");

    const [article] = await strapi
      .documents(UID)
      .findMany({ status: "published", limit: 1 });

    await strapi.documents(UID).update({
      documentId: article.documentId,
      data: { title: "Should invalidate the homepage too" },
    });

    const third = await agent().get("/api/homepage");
    expect(third.get("x-cache")).toBe("MISS");
  });
});
