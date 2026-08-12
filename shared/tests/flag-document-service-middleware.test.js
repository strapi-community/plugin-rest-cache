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


describe("enableDocumentServiceMiddleware: false (legacy route invalidation)", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    process.env.ENABLE_DOCUMENT_SERVICE_MIDDLEWARE = "false";
    await setup();
  });
  afterAll(async () => {
    delete process.env.ENABLE_DOCUMENT_SERVICE_MIDDLEWARE;
    await teardown();
  });

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  it("still purges on an admin content-manager write", async () => {
    const [article] = await strapi
      .documents(ARTICLE)
      .findMany({ status: "published", limit: 1 });

    await warmArticleCache();

    const res = await adminAgent()
      .put(`/content-manager/collection-types/${ARTICLE}/${article.documentId}`)
      .send({ title: "Edited through the admin" });
    expect(res.status).toBe(200);

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("MISS");
  });

  it("does NOT purge a write made outside of an HTTP request", async () => {
    // This is the limitation the document service middleware exists to fix.
    // Pinning it here documents exactly what opting out costs.
    const [article] = await strapi
      .documents(ARTICLE)
      .findMany({ status: "published", limit: 1 });

    await warmArticleCache();

    await strapi.documents(ARTICLE).update({
      documentId: article.documentId,
      data: { title: "Edited by a background job" },
    });

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("HIT");
  });
});
