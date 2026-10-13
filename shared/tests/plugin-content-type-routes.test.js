"use strict";

/**
 * Listed routes of a plugin-owned content type must be cached.
 *
 * docs/guide/caching/custom-routes.md ("Plugin routes") documents
 * `{ contentType: "plugin::users-permissions.user", injectDefaultRoutes: false,
 * routes: ["/api/users"] }`. flattenRoutes() only walked strapi.apis, so a
 * route registered by a plugin was never found and the recv middleware was
 * never injected - the route was silently uncached, with nothing but a debug
 * line to say so.
 *
 * The fixture entry is behind CACHE_PLUGIN_USERS so no other spec sees it.
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

describe("plugin content type with listed routes", () => {
  beforeAll(async () => {
    process.env.CACHE_PLUGIN_USERS = "true";
    await setup();

    // Let anonymous callers list users, so the request carries no
    // authorization header and the default hitpass does not bypass it. Granted
    // only for the route under test, and only in this spec's database.
    const publicRole = await strapi
      .query("plugin::users-permissions.role")
      .findOne({ where: { type: "public" } });
    await strapi.query("plugin::users-permissions.permission").create({
      data: {
        action: "plugin::users-permissions.user.find",
        role: publicRole.id,
      },
    });
  });

  afterAll(async () => {
    delete process.env.CACHE_PLUGIN_USERS;
    await teardown();
  });

  it("resolves the plugin content type into the strategy", () => {
    expect(
      strapi
        .plugin("rest-cache")
        .service("cacheConfig")
        .isCached("plugin::users-permissions.user")
    ).toBe(true);
  });

  it("caches GET /api/users", async () => {
    const first = await agent().get("/api/users");
    const second = await agent().get("/api/users");

    expect(first.status).toBe(200);
    expect(first.get("x-cache")).toBe("MISS");
    expect(second.status).toBe(200);
    expect(second.get("x-cache")).toBe("HIT");
  });

  it("purges GET /api/users when a user is created", async () => {
    // Warm, whatever the previous test left behind.
    await agent().get("/api/users");
    const warm = await agent().get("/api/users");
    expect(warm.get("x-cache")).toBe("HIT");

    const role = await strapi
      .query("plugin::users-permissions.role")
      .findOne({ where: { type: "authenticated" } });
    await strapi.plugin("users-permissions").service("user").add({
      username: "cached-route-purge",
      email: "cached-route-purge@strapi.io",
      password: "Password123",
      provider: "local",
      confirmed: true,
      role: role.id,
    });

    const after = await agent().get("/api/users");
    expect(after.get("x-cache")).toBe("MISS");
    expect(after.body.map((user) => user.username)).toContain(
      "cached-route-purge"
    );
  });
});
