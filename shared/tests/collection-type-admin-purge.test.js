"use strict";

/**
 * Coverage for admin content-manager actions that mutate content and therefore
 * must purge the REST cache.
 *
 * The plugin injects its `purgeAdmin` middleware onto a hardcoded list of
 * content-manager routes (server/src/utils/middlewares/injectMiddlewares.js).
 * Any write route missing from that list silently leaves stale content in the
 * cache. See https://github.com/strapi-community/plugin-rest-cache/issues/127
 */

const { setup, teardown, agent, adminAgent } = require("./helpers/strapi");

jest.setTimeout(60000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const UID = "api::article.article";
const CM = `/content-manager/collection-types/${UID}`;

/** Warm the cache for the article list and assert we got there. */
async function warmArticleCache() {
  const first = await agent().get("/api/articles");
  const second = await agent().get("/api/articles");

  expect(first.get("x-cache")).toBe("MISS");
  expect(second.get("x-cache")).toBe("HIT");
}

/** Read documents straight from the document service, bypassing the cache. */
function findArticles(status = "published") {
  return strapi.documents(UID).findMany({ status });
}

describe("admin content-manager purge", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();
  });
  afterAll(async () => await teardown());

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  it("purges when an entry is published", async () => {
    const [draft] = await strapi
      .documents(UID)
      .findMany({ status: "draft", limit: 1 });

    await warmArticleCache();

    const res = await adminAgent().post(
      `${CM}/${draft.documentId}/actions/publish`
    );
    expect(res.status).toBe(200);

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("MISS");
  });

  it("purges when an entry is unpublished", async () => {
    const [published] = await findArticles();

    await warmArticleCache();

    const res = await adminAgent().post(
      `${CM}/${published.documentId}/actions/unpublish`
    );
    expect(res.status).toBe(200);

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("MISS");
  });

  it("purges when entries are bulk published", async () => {
    const drafts = await strapi
      .documents(UID)
      .findMany({ status: "draft", limit: 2 });
    const documentIds = drafts.map((d) => d.documentId);

    await warmArticleCache();

    const res = await adminAgent()
      .post(`${CM}/actions/bulkPublish`)
      .send({ documentIds });
    expect(res.status).toBe(200);

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("MISS");
  });

  it("purges when entries are bulk unpublished", async () => {
    const published = await findArticles();
    const documentIds = published.slice(0, 2).map((d) => d.documentId);

    await warmArticleCache();

    const res = await adminAgent()
      .post(`${CM}/actions/bulkUnpublish`)
      .send({ documentIds });
    expect(res.status).toBe(200);

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("MISS");
  });

  it("purges when an entry is cloned", async () => {
    const [source] = await findArticles();

    await warmArticleCache();

    const res = await adminAgent()
      .post(`${CM}/clone/${source.documentId}`)
      .send({ title: "Cloned article", slug: "cloned-article" });
    expect(res.status).toBe(200);

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("MISS");
  });

  it("purges when a draft is discarded", async () => {
    const [published] = await findArticles();

    // Create an unpublished edit so there is a draft to discard.
    await strapi.documents(UID).update({
      documentId: published.documentId,
      data: { title: "Edited but not published" },
    });

    await warmArticleCache();

    const res = await adminAgent().post(
      `${CM}/${published.documentId}/actions/discard`
    );
    expect(res.status).toBe(200);

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("MISS");
  });
});
