"use strict";

/**
 * Coverage for the content API purge endpoint.
 *
 * Lets a deploy pipeline, webhook or scheduled job invalidate the cache without
 * admin credentials. It is off by default, because purging is destructive and
 * cheap to trigger.
 *
 * See https://github.com/strapi-community/plugin-rest-cache/issues/99
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

describe("content api purge - disabled by default", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();
  });
  afterAll(async () => await teardown());

  it("is not reachable when the flag is off", async () => {
    const res = await agent()
      .post("/api/rest-cache/purge")
      .send({ contentType: "api::article.article" });

    // 404 rather than 403: a disabled endpoint should not announce itself.
    // 401/403 would also be acceptable here since the route requires auth,
    // but it must never succeed.
    expect(res.status).not.toBe(200);
  });

  it("leaves the cache untouched", async () => {
    const first = await agent().get("/api/articles");
    const second = await agent().get("/api/articles");
    expect(first.get("x-cache")).toBe("MISS");
    expect(second.get("x-cache")).toBe("HIT");

    await agent()
      .post("/api/rest-cache/purge")
      .send({ contentType: "api::article.article" });

    const third = await agent().get("/api/articles");
    expect(third.get("x-cache")).toBe("HIT");
  });
});

describe("content api purge - enabled", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    process.env.ENABLE_CONTENT_API_PURGE = "true";
    await setup();

    // The route still needs granting to the public role, exactly as any other
    // content API endpoint does.
    const publicRole = await strapi
      .query("plugin::users-permissions.role")
      .findOne({ where: { type: "public" } });

    await strapi.query("plugin::users-permissions.permission").create({
      data: {
        action: "plugin::rest-cache.purge.contentApi",
        role: publicRole.id,
      },
    });
  });
  afterAll(async () => {
    delete process.env.ENABLE_CONTENT_API_PURGE;
    await teardown();
  });

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  it("purges a cached content type", async () => {
    const first = await agent().get("/api/articles");
    const second = await agent().get("/api/articles");
    expect(first.get("x-cache")).toBe("MISS");
    expect(second.get("x-cache")).toBe("HIT");

    const purge = await agent()
      .post("/api/rest-cache/purge")
      .send({ contentType: "api::article.article" });
    expect(purge.status).toBe(200);

    const third = await agent().get("/api/articles");
    expect(third.get("x-cache")).toBe("MISS");
  });

  it("rejects a missing contentType", async () => {
    const res = await agent().post("/api/rest-cache/purge").send({});
    expect(res.status).toBe(400);
  });

  it("rejects a contentType that is not cached", async () => {
    const res = await agent()
      .post("/api/rest-cache/purge")
      .send({ contentType: "api::writer.writer" });
    expect(res.status).toBe(400);
  });
});
