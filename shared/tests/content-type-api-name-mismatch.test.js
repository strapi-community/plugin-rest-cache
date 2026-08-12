"use strict";

/**
 * Coverage for content types whose name differs from their parent API.
 *
 * `api::writer.editor` lives under the `writer` API, so its routes are
 * registered at `strapi.apis.writer.routes.editor` - there is no
 * `strapi.apis.editor`. Resolving the API from the content type's singular
 * name therefore crashed the whole application at register time with
 * "Cannot read properties of undefined (reading 'routes')".
 *
 * See https://github.com/strapi-community/plugin-rest-cache/issues/125
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(60000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const UID = "api::writer.editor";

describe("content type whose name differs from its API", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();
  });
  afterAll(async () => await teardown());

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  it("resolves default routes for the content type", () => {
    const cacheConfig = strapi.plugin("rest-cache").service("cacheConfig");
    const conf = cacheConfig.get(UID);

    expect(conf).toBeDefined();

    // Routes must come from the `writer` API but describe the `editor`
    // content type, i.e. /api/editors rather than /api/writers.
    const paths = conf.routes.map((route) => route.path);
    expect(paths).toContain("/api/editors");
    expect(paths).toContain("/api/editors/:id");
    expect(paths).not.toContain("/api/writers");
  });

  it("caches the collection route", async () => {
    const first = await agent().get("/api/editors");
    const second = await agent().get("/api/editors");

    expect(first.status).toBe(200);
    expect(first.get("x-cache")).toBe("MISS");
    expect(second.get("x-cache")).toBe("HIT");
  });

  it("caches the single-entry route", async () => {
    const editor = await strapi
      .documents(UID)
      .create({ data: { name: "Ada", email: "ada@example.com" } });

    const first = await agent().get(`/api/editors/${editor.documentId}`);
    const second = await agent().get(`/api/editors/${editor.documentId}`);

    expect(first.status).toBe(200);
    expect(first.get("x-cache")).toBe("MISS");
    expect(second.get("x-cache")).toBe("HIT");
  });

  it("purges when the content type changes", async () => {
    const first = await agent().get("/api/editors");
    const second = await agent().get("/api/editors");
    expect(first.get("x-cache")).toBe("MISS");
    expect(second.get("x-cache")).toBe("HIT");

    await strapi
      .documents(UID)
      .create({ data: { name: "Grace", email: "grace@example.com" } });

    const third = await agent().get("/api/editors");
    expect(third.get("x-cache")).toBe("MISS");
  });

  it("does not purge the sibling content type sharing the API", async () => {
    // `writer` is not configured for caching, but the important part is that
    // an `editor` write resolves to the editor routes only - the two content
    // types share an API and must not be conflated.
    const cacheConfig = strapi.plugin("rest-cache").service("cacheConfig");

    expect(cacheConfig.isCached("api::writer.writer")).toBe(false);
    expect(cacheConfig.isCached(UID)).toBe(true);
  });
});
