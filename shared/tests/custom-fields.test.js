"use strict";

/**
 * Guard for plugin load ordering against custom fields.
 *
 * #119 reported that a content type using a custom field owned by another
 * plugin would fail at startup with "Could not find Custom Field", depending on
 * plugin order, because rest-cache reads strapi.apis during register() to
 * inject its route middleware.
 *
 * The playground reproduces that arrangement permanently: a local plugin owns
 * the custom field, a cached content type uses it, and rest-cache is declared
 * first in config/plugins.js. If reading strapi.apis during register ever
 * starts validating custom fields again, this suite stops booting.
 *
 * See https://github.com/strapi-community/plugin-rest-cache/issues/119
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

describe("custom fields and plugin load order", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();
  });
  afterAll(async () => await teardown());

  it("boots with a plugin-owned custom field on a cached content type", () => {
    const attribute =
      strapi.contentType("api::category.category").attributes.accent;

    expect(attribute.customField).toBe("plugin::colour-field.colour");
  });

  it("loads the plugin that owns the custom field", () => {
    // On 5.52 strapi.customFields exposes only register() - the throwing get()
    // that produced "Could not find Custom Field" is no longer reachable from
    // anywhere in Strapi, which is a large part of why #119 no longer
    // reproduces. So assert the owning plugin loaded rather than introspecting
    // a registry whose read API has changed.
    expect(strapi.plugin("colour-field")).toBeDefined();
  });

  it("still caches the content type using it", async () => {
    await strapi.plugin("rest-cache").service("cacheStore").reset();

    const first = await agent().get("/api/categories");
    const second = await agent().get("/api/categories");

    expect(first.get("x-cache")).toBe("MISS");
    expect(second.get("x-cache")).toBe("HIT");
  });
});
