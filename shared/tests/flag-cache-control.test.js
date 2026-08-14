"use strict";

/**
 * Coverage for strategy.cacheControl - emitting Cache-Control on responses this
 * plugin cached.
 *
 * Design and original implementation by @pinkasey in
 * https://github.com/strapi-community/plugin-rest-cache/pull/96, carried
 * forward by
 * https://github.com/strapi-community/plugin-rest-cache/issues/175.
 *
 * The assertions that matter are the ones about what is *not* emitted. A
 * Cache-Control on the wrong response is worse than none at all: it moves the
 * caching decision to a browser or CDN, where a purge cannot reach it, so the
 * mistake is served for the whole max-age no matter what an admin does.
 *
 * Each block boots its own Strapi instance because the flag is read at
 * register time.
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const store = () => strapi.plugin("rest-cache").service("cacheStore");

const cacheControlOf = (res) => res.headers["cache-control"];

describe("cacheControl: disabled (the shipped default)", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();
  });
  afterAll(async () => await teardown());

  beforeEach(() => store().reset());

  it("emits no Cache-Control on a cached response", async () => {
    const first = await agent().get("/api/articles");
    const second = await agent().get("/api/articles");

    // The response really is coming from the cache, so the absence of the
    // header below is about the flag and not about a cache miss.
    expect(first.get("x-cache")).toBe("MISS");
    expect(second.get("x-cache")).toBe("HIT");

    expect(cacheControlOf(first)).toBeUndefined();
    expect(cacheControlOf(second)).toBeUndefined();
  });
});

describe("cacheControl: enabled", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    process.env.CACHE_CONTROL_ENABLED = "true";
    await setup();
  });
  afterAll(async () => {
    delete process.env.CACHE_CONTROL_ENABLED;
    await teardown();
  });

  beforeEach(() => store().reset());

  describe("max-age is the route's maxAge, in seconds", () => {
    it("turns 3600000ms into max-age=3600 on a HIT", async () => {
      const first = await agent().get("/api/articles");
      const second = await agent().get("/api/articles");

      expect(second.get("x-cache")).toBe("HIT");

      // Milliseconds to seconds, not the other way round. Converting the wrong
      // way here yields max-age=3600000000, i.e. 114 years.
      // See https://github.com/strapi-community/plugin-rest-cache/issues/126
      expect(cacheControlOf(second)).toBe("private, max-age=3600");
      expect(cacheControlOf(first)).toBe("private, max-age=3600");
    });

    it("uses the route's own maxAge, not the strategy default", async () => {
      // /api/categories/slug/:slug+ is configured with maxAge: 18000.
      const first = await agent().get("/api/categories/slug/news");
      const second = await agent().get("/api/categories/slug/news");

      expect(second.get("x-cache")).toBe("HIT");
      expect(cacheControlOf(second)).toBe("private, max-age=18");
      expect(cacheControlOf(first)).toBe("private, max-age=18");
    });
  });

  it("emits nothing for a HITPASS response", async () => {
    // The default hitpass bypasses anything carrying a cookie. Telling a
    // browser to cache a deliberately-uncached response for an hour puts it
    // somewhere no purge can reach.
    const res = await agent().get("/api/articles").set("Cookie", "sid=abc");

    expect(res.status).toBe(200);
    expect(res.get("x-cache")).toBe("HITPASS");
    expect(cacheControlOf(res)).toBeUndefined();
  });

  it("emits nothing for a response the plugin refused to store", async () => {
    // A streamed body cannot be replayed, so isCacheable refuses it. Nothing
    // was cached, so there is nothing to advertise.
    const res = await agent().get("/api/categories/probe/stream");

    expect(res.status).toBe(200);
    expect(cacheControlOf(res)).toBeUndefined();
  });

  describe("a handler that set Cache-Control itself", () => {
    it("keeps a handler's no-store", async () => {
      const res = await agent().get(
        "/api/categories/probe/cache-control?value=no-store"
      );

      expect(res.status).toBe(200);
      expect(cacheControlOf(res)).toBe("no-store");
    });

    it("keeps a handler's directive even when the response is cacheable", async () => {
      const res = await agent().get(
        "/api/categories/probe/cache-control?value=max-age%3D99"
      );

      expect(res.status).toBe(200);
      expect(cacheControlOf(res)).toBe("max-age=99");
    });
  });
});

describe("cacheControl: enabled with scope public", () => {
  // The warning is logged once, while Strapi is registering the plugin, so it
  // has to be captured around setup(). The playground's log level is "error",
  // which would swallow it.
  let bootOutput = "";

  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    process.env.CACHE_CONTROL_ENABLED = "true";
    process.env.CACHE_CONTROL_SCOPE = "public";
    process.env.STRAPI_LOG_LEVEL = "warn";

    // Strapi logs through winston, whose console transport writes to
    // console._stdout when it exists - under jest that is jest's own stream,
    // not process.stdout - so both have to be watched.
    const streams = [process.stdout, console._stdout].filter(
      (stream, index, all) => stream && all.indexOf(stream) === index
    );

    const spies = streams.map((stream) => {
      const write = stream.write.bind(stream);

      return jest.spyOn(stream, "write").mockImplementation((chunk, ...rest) => {
        bootOutput += String(chunk);
        return write(chunk, ...rest);
      });
    });

    try {
      await setup();
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
  afterAll(async () => {
    delete process.env.CACHE_CONTROL_ENABLED;
    delete process.env.CACHE_CONTROL_SCOPE;
    delete process.env.STRAPI_LOG_LEVEL;
    await teardown();
  });

  beforeEach(() => store().reset());

  it("never says public on a route keyed per caller", async () => {
    // api::category.category is configured with keys.useAuth, so its entries
    // are caller-specific. A shared "public" would let a CDN hand one caller's
    // response to another.
    // See https://github.com/strapi-community/plugin-rest-cache/issues/113
    const first = await agent().get("/api/categories");
    const second = await agent().get("/api/categories");

    expect(second.get("x-cache")).toBe("HIT");
    expect(cacheControlOf(second)).not.toContain("public");
    expect(cacheControlOf(second)).toBe("private, max-age=3600");
    expect(cacheControlOf(first)).toBe("private, max-age=3600");
  });

  it("says at boot that it downgraded the directive", () => {
    // The downgrade is silent on the wire, and a CDN that quietly stops caching
    // is a miserable thing to debug from the other end.
    expect(bootOutput).toContain("cacheControl.scope");
    expect(bootOutput).toContain("api::category.category");
  });

  it("still says public where entries are shared", async () => {
    const first = await agent().get("/api/articles");
    const second = await agent().get("/api/articles");

    expect(second.get("x-cache")).toBe("HIT");
    expect(cacheControlOf(second)).toBe("public, max-age=3600");
    expect(cacheControlOf(first)).toBe("public, max-age=3600");
  });
});
