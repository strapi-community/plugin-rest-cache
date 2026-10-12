"use strict";

/**
 * Coverage for routes listed under a content type inheriting its options.
 *
 * A route listed in a content type's `routes` with no `maxAge` or `hitpass` of
 * its own must take them from that content type, and only fall back to the
 * strategy when the content type does not set them either - the same way the
 * injected core routes and `keys` already did. Listed routes used to get the
 * strategy's values, so a content type's 10 minute maxAge was stored for an
 * hour and its `hitpass: false` was never applied.
 *
 * api::category.category sets hitpass: false and a maxAge read from
 * CATEGORY_MAX_AGE; /api/categories/probe/inherits sets nothing itself.
 *
 * See https://github.com/strapi-community/plugin-rest-cache/issues/230
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(60000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

// Far apart, so an entry stored for the strategy's maxAge is still a HIT long
// after the content type's maxAge has gone by.
const CONTENT_TYPE_MAX_AGE_MS = 1500;
const STRATEGY_MAX_AGE_MS = 3600000;

const ROUTE = "/api/categories/probe/inherits";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("listed routes inherit their content type's options", () => {
  // Everything written to the log while the plugin resolves its config.
  let bootLog = "";

  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    process.env.ENABLE_MAX_AGE = String(STRATEGY_MAX_AGE_MS);
    process.env.CATEGORY_MAX_AGE = String(CONTENT_TYPE_MAX_AGE_MS);
    // shared/config/logger.js only logs errors unless told otherwise.
    process.env.STRAPI_LOG_LEVEL = "warn";

    const write = process.stdout.write.bind(process.stdout);
    const spy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk, ...rest) => {
        bootLog += String(chunk);
        return write(chunk, ...rest);
      });
    try {
      await setup();
    } finally {
      spy.mockRestore();
    }
  });
  afterAll(async () => {
    delete process.env.ENABLE_MAX_AGE;
    delete process.env.CATEGORY_MAX_AGE;
    delete process.env.STRAPI_LOG_LEVEL;
    await teardown();
  });

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  it("applies the content type's hitpass, not the strategy's", async () => {
    // The strategy's hitpass bypasses anything with a cookie; the content
    // type's hitpass: false does not.
    const first = await agent().get(ROUTE).set("Cookie", "a=1");
    const second = await agent().get(ROUTE).set("Cookie", "a=1");

    expect(first.status).toBe(200);
    expect(first.get("x-cache")).toBe("MISS");
    expect(second.get("x-cache")).toBe("HIT");
  });

  it("expires entries after the content type's maxAge, not the strategy's", async () => {
    const first = await agent().get(ROUTE);
    const second = await agent().get(ROUTE);
    expect(first.get("x-cache")).toBe("MISS");
    expect(second.get("x-cache")).toBe("HIT");

    await sleep(CONTENT_TYPE_MAX_AGE_MS * 1.5);

    const third = await agent().get(ROUTE);
    expect(third.get("x-cache")).toBe("MISS");
  });

  // Every category route keys on the caller: the core routes and the probe
  // through the content type's keys, /api/categories/slug/:slug+ because its
  // own keys keep the content type's useAuth. Nothing to warn about.
  it("does not warn when every route keys on the caller", () => {
    expect(bootLog).not.toMatch(/hitpass disabled but keys\.useAuth is not set/);
  });
});

describe("a content type that does not key on the caller", () => {
  let bootLog = "";

  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    // category keeps hitpass: false but nothing keys on the caller, so an
    // authenticated response would be shared by everyone who asks.
    process.env.CATEGORY_USE_AUTH = "false";
    process.env.STRAPI_LOG_LEVEL = "warn";

    const write = process.stdout.write.bind(process.stdout);
    const spy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk, ...rest) => {
        bootLog += String(chunk);
        return write(chunk, ...rest);
      });
    try {
      await setup();
    } finally {
      spy.mockRestore();
    }
  });
  afterAll(async () => {
    delete process.env.CATEGORY_USE_AUTH;
    delete process.env.STRAPI_LOG_LEVEL;
    await teardown();
  });

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  // Listed routes used to get the strategy's hitpass, which bypasses anything
  // with an authorization or cookie header. Inheriting hitpass: false here
  // would start sharing those responses, so the bypass stays.
  it("keeps the strategy's bypass on a listed route", async () => {
    const res = await agent().get(ROUTE).set("Cookie", "a=1");

    expect(res.status).toBe(200);
    expect(res.get("x-cache")).toBe("HITPASS");
  });

  it("still caches anonymous requests on that route", async () => {
    const first = await agent().get(ROUTE);
    const second = await agent().get(ROUTE);

    expect(first.get("x-cache")).toBe("MISS");
    expect(second.get("x-cache")).toBe("HIT");
  });

  // Named per route: the injected core routes really do cache authenticated
  // requests unkeyed here; the listed routes, which keep the bypass, do not.
  it("warns about the routes that cache authenticated requests unkeyed, and only those", () => {
    expect(bootLog).toMatch(/hitpass disabled but keys\.useAuth is not set/);
    expect(bootLog).toContain("/api/categories/:id");
    expect(bootLog).not.toContain(ROUTE);
    expect(bootLog).not.toContain("/api/categories/slug/:slug+");
  });
});
