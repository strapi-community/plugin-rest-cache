"use strict";

/**
 * Coverage for content edited through Strapi's MCP tools.
 *
 * The content-manager registers MCP tools for create, update, delete, publish,
 * unpublish and discard_draft. They are worth testing specifically because they
 * are invisible to the invalidation strategy this plugin used to rely on: an
 * MCP call is a POST to /mcp, so no content-manager write route is involved and
 * the hardcoded route list could never have seen it.
 *
 * They persist through the content-manager's document-manager service, which
 * calls strapi.documents(), so the document service middleware added in #129
 * covers them without knowing MCP exists. These tests drive that service
 * directly - the same code path the MCP handlers take, without the transport.
 *
 * Driving it directly is also currently the only option: MCP cannot be enabled
 * in this playground at all, because Strapi derives tool names from the API
 * segment of the uid and this app has two content types in one API, so
 * registration collides and bootstrap fails. See config/server.js.
 *
 * See https://github.com/strapi-community/plugin-rest-cache/issues/133
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const UID = "api::article.article";

const documentManager = () =>
  strapi.plugin("content-manager").service("document-manager");

async function warmArticleCache() {
  const first = await agent().get("/api/articles");
  const second = await agent().get("/api/articles");

  expect(first.get("x-cache")).toBe("MISS");
  expect(second.get("x-cache")).toBe("HIT");
}

describe("content edited through MCP tools", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();
  });
  afterAll(async () => await teardown());

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  it("purges when an entry is updated", async () => {
    const [article] = await strapi
      .documents(UID)
      .findMany({ status: "published", limit: 1 });

    await warmArticleCache();

    await documentManager().update(article.documentId, UID, {
      data: { title: "Edited through an MCP tool" },
    });

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("MISS");
  });

  it("purges when an entry is created", async () => {
    await warmArticleCache();

    await documentManager().create(UID, {
      data: {
        title: "Created through an MCP tool",
        description: "Created via document-manager",
        content: "Body copy.",
        slug: "created-through-mcp",
      },
      status: "published",
    });

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("MISS");
  });

  it("purges when an entry is published", async () => {
    const [draft] = await strapi
      .documents(UID)
      .findMany({ status: "draft", limit: 1 });

    await warmArticleCache();

    await documentManager().publish(draft.documentId, UID);

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("MISS");
  });

  it("purges when an entry is deleted", async () => {
    const [article] = await strapi
      .documents(UID)
      .findMany({ status: "published", limit: 1 });

    await warmArticleCache();

    await documentManager().delete(article.documentId, UID);

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("MISS");
  });

  it("does not cache the /mcp endpoint itself", async () => {
    // /mcp writes straight to the socket with ctx.respond = false, so there is
    // nothing for the cache to store even if a route were configured for it.
    const keys = await strapi.plugin("rest-cache").service("cacheStore").keys();
    expect(keys.filter((k) => k.startsWith("/mcp"))).toHaveLength(0);
  });
});
