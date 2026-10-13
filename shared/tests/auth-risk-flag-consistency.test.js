"use strict";

/**
 * The admin dashboard's "Shared across callers" badge and the boot warning
 * must agree on which content types cache authenticated responses under keys
 * that do not identify the caller.
 *
 * The boot warning is computed per route, on the values each route actually
 * resolved to (#230). The badge used to be computed from the content type's
 * own `hitpass` and `keys.useAuth`, which a route's resolved values can differ
 * from in both directions - so the dashboard missed a route the server warned
 * about, and flagged a content type the server considered safe.
 */

const { setup, teardown, agent, adminAgent } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

// Strapi requires config/plugins.js, which requires ./cache-strategy, through
// jest's module registry - so the strategy can be extended here without
// touching the shared config every other spec uses.
jest.mock("../config/cache-strategy", () => {
  const real = jest.requireActual("../config/cache-strategy");

  return (args) => {
    const strategy = real(args);

    strategy.contentTypes = [
      // (C) A route with hitpass: false whose useAuth is truthy but not the
      // boolean true - what `env("USE_AUTH")` hands over, since env() returns
      // strings. The key generator tests useAuth for truthiness, so these
      // entries are keyed per caller and nothing is shared.
      {
        contentType: "api::article.article",
        injectDefaultRoutes: false,
        routes: [
          {
            path: "/api/articles",
            method: "GET",
            hitpass: false,
            keys: { useQueryParams: true, useHeaders: [], useAuth: "true" },
          },
        ],
      },
      // (A) The content type keeps the default hitpass; one listed route sets
      // hitpass: false itself, without keys.useAuth. The boot warning names
      // the route; the content type's own hitpass says nothing is wrong.
      {
        contentType: "api::writer.editor",
        routes: [
          {
            path: "/api/editors/:id",
            method: "GET",
            hitpass: false,
            keys: { useQueryParams: true, useHeaders: [] },
          },
        ],
      },
      // (B) The content type has hitpass: false and no keys.useAuth, but has
      // only listed routes. Those keep the strategy's bypass on top
      // (listedRouteHitpass), so authenticated requests are never cached and
      // the boot does not warn - yet the content type's own hitpass is false.
      {
        contentType: "api::page.page",
        hitpass: false,
        injectDefaultRoutes: false,
        routes: ["/api/pages"],
      },
    ];

    return strategy;
  };
});

// What ContentTypeTable renders the badge from: the per-route list when the
// server sends it, the content type's own settings otherwise.
const dashboardFlags = (stats) =>
  stats.unkeyedAuthenticatedRoutes
    ? stats.unkeyedAuthenticatedRoutes.length > 0
    : stats.hitpass === false && !stats.keysAuthIdentity;

describe("Shared across callers agrees with the boot warning", () => {
  let bootLog = "";

  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
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

    // (C) is checked against what the cache actually does, which needs
    // authenticated callers the route lets through.
    const role = await strapi
      .query("plugin::users-permissions.role")
      .findOne({ where: { type: "authenticated" } });
    await strapi.query("plugin::users-permissions.permission").create({
      data: { action: "api::article.article.find", role: role.id },
    });
  });
  afterAll(async () => {
    delete process.env.STRAPI_LOG_LEVEL;
    await teardown();
  });

  const statsFor = async (uid) => {
    const res = await adminAgent().get("/rest-cache/stats");
    expect(res.status).toBe(200);
    return res.body.contentTypes.find((c) => c.uid === uid);
  };

  const bootWarns = (uid) =>
    bootLog.includes(`"${uid}" has hitpass disabled but keys.useAuth is not set`);

  it("(A) flags a content type whose listed route shares authenticated entries", async () => {
    // Precondition: the server considers this unsafe.
    expect(bootWarns("api::writer.editor")).toBe(true);

    const stats = await statsFor("api::writer.editor");
    expect(dashboardFlags(stats)).toBe(true);
    expect(stats.unkeyedAuthenticatedRoutes).toEqual(["/api/editors/:id"]);
  });

  it("(B) does not flag a content type whose routes all keep the strategy bypass", async () => {
    // Precondition: the server considers this safe.
    expect(bootWarns("api::page.page")).toBe(false);

    const stats = await statsFor("api::page.page");
    expect(dashboardFlags(stats)).toBe(false);
    expect(stats.unkeyedAuthenticatedRoutes).toEqual([]);
  });

  it("(C) does not flag a route whose truthy non-boolean useAuth keys entries per caller", async () => {
    const jwtFor = async (username) => {
      const role = await strapi
        .query("plugin::users-permissions.role")
        .findOne({ where: { type: "authenticated" } });
      const user = await strapi.query("plugin::users-permissions.user").create({
        data: {
          username,
          email: `${username}@example.com`,
          password: "Password123",
          confirmed: true,
          blocked: false,
          role: role.id,
          provider: "local",
        },
      });
      return strapi.plugin("users-permissions").service("jwt").issue({ id: user.id });
    };
    const alice = await jwtFor("flag-alice");
    const bob = await jwtFor("flag-bob");
    const get = (jwt) =>
      agent().get("/api/articles").set("Authorization", `Bearer ${jwt}`);

    // Precondition: the key really does identify the caller. Alice's entry is
    // cached and served back to her, and Bob does not get it.
    await strapi.plugin("rest-cache").service("cacheStore").reset();
    expect((await get(alice)).get("x-cache")).toBe("MISS");
    expect((await get(alice)).get("x-cache")).toBe("HIT");
    expect((await get(bob)).get("x-cache")).toBe("MISS");

    // So neither the boot warning nor the badge may claim it is shared.
    expect(bootWarns("api::article.article")).toBe(false);
    const stats = await statsFor("api::article.article");
    expect(stats.unkeyedAuthenticatedRoutes).toEqual([]);
    expect(dashboardFlags(stats)).toBe(false);
  });

  it("keeps the content type's own fields as they were", async () => {
    // The badge moved to the new field; these still describe the content
    // type itself, for anything else reading them.
    const page = await statsFor("api::page.page");
    expect(page.hitpass).toBe(false);
    expect(page.keysAuthIdentity).toBe(false);

    const editor = await statsFor("api::writer.editor");
    expect(editor.hitpass).toBe(true);
    expect(editor.keysAuthIdentity).toBe(false);
  });
});
