"use strict";

/**
 * Coverage for responses the cache must refuse to buffer.
 *
 * `recv` assumes it can capture ctx.body and replay it later. That assumption
 * does not hold for every response:
 *
 *   - a handler may set `ctx.respond = false` and write to the socket itself,
 *     in which case ctx.body is meaningless. Strapi's own /mcp route does this.
 *   - a streamed body is consumed once; storing the stream object caches
 *     something that cannot be replayed.
 *   - a response carrying Set-Cookie is specific to one caller and must never
 *     be served to another.
 *
 * See https://github.com/strapi-community/plugin-rest-cache/issues/133
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const store = () => strapi.plugin("rest-cache").service("cacheStore");

describe("uncacheable responses", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();
  });
  afterAll(async () => await teardown());

  beforeEach(() => store().reset());

  describe("ctx.respond = false", () => {
    it("serves the raw response intact", async () => {
      const res = await agent().get("/api/categories/probe/raw");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ raw: true });
    });

    it("serves it intact on a repeat request", async () => {
      const first = await agent().get("/api/categories/probe/raw");
      const second = await agent().get("/api/categories/probe/raw");

      expect(first.body).toEqual({ raw: true });
      expect(second.body).toEqual({ raw: true });
    });

    it("does not store anything for it", async () => {
      await agent().get("/api/categories/probe/raw");

      const keys = await store().keys();
      expect(keys.filter((k) => k.includes("/categories/probe/raw"))).toHaveLength(0);
    });
  });

  describe("streamed body", () => {
    it("serves the stream intact", async () => {
      const res = await agent().get("/api/categories/probe/stream");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ streamed: true });
    });

    it("serves it intact on a repeat request", async () => {
      await agent().get("/api/categories/probe/stream");
      const second = await agent().get("/api/categories/probe/stream");

      expect(second.status).toBe(200);
      expect(second.body).toEqual({ streamed: true });
    });

    it("does not store the stream", async () => {
      await agent().get("/api/categories/probe/stream");

      const keys = await store().keys();
      expect(keys.filter((k) => k.includes("/categories/probe/stream"))).toHaveLength(0);
    });
  });

  describe("Set-Cookie", () => {
    it("does not cache a response carrying a cookie", async () => {
      await agent().get("/api/categories/probe/with-cookie");

      const keys = await store().keys();
      expect(keys.filter((k) => k.includes("with-cookie"))).toHaveLength(0);
    });

    it("gives each caller their own cookie", async () => {
      const first = await agent().get("/api/categories/probe/with-cookie");
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await agent().get("/api/categories/probe/with-cookie");

      const cookieOf = (res) => String(res.headers["set-cookie"] ?? "");

      expect(cookieOf(first)).not.toBe("");
      expect(cookieOf(second)).not.toBe("");
      // A cached response would replay the first caller's cookie to everyone.
      expect(cookieOf(first)).not.toBe(cookieOf(second));
    });
  });

  it("still caches ordinary responses", async () => {
    const first = await agent().get("/api/categories");
    const second = await agent().get("/api/categories");

    expect(first.get("x-cache")).toBe("MISS");
    expect(second.get("x-cache")).toBe("HIT");
  });
});
