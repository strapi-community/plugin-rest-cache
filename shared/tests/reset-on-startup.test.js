"use strict";

/**
 * resetOnStartup must empty the cache when the server starts, and only then.
 *
 * register.ts used to call cacheStore.reset() during the register phase, but
 * the provider is only handed to the store in bootstrap.ts, which runs later. A
 * reset issued before init() is refused by the store ("REST Cache provider not
 * initialized") and returns null, so the option was a silent no-op: entries a
 * persistent provider (Redis) still held from the previous run survived the
 * restart.
 *
 * Making it work in bootstrap would have made it fire on every strapi.load(),
 * and the CLI loads Strapi for routes:list, export, import, transfer, the
 * admin:* user commands, configuration:dump, openapi:generate and any script
 * that calls load(). Against a shared Redis each of those would have emptied
 * the production cache. So the reset waits for strapi.listen(), which only
 * `strapi start`, `strapi develop` and `strapi console` call.
 *
 * The memory provider starts empty on every boot, so "an entry from the
 * previous run" is simulated: the store's init() is wrapped to write an entry
 * through the provider the moment it is handed over - before anything else in
 * bootstrap runs, which is exactly the state a Redis-backed store is in at that
 * point. The register and bootstrap phases are run separately (as load() does)
 * so the wrapper can be installed between them.
 */

const { createStrapi, compileStrapi } = require("@strapi/strapi");
const { teardown } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

// Deliberately not the key of any content type: the playground's own bootstrap
// writes articles and the like, and the purge those writes trigger would remove
// an article key whether or not the reset ran - the test would pass on the
// broken code.
const STALE_KEY = "/api/stale-from-previous-run";

describe("resetOnStartup: true", () => {
  const errors = [];

  const storedKeys = () =>
    strapi.plugin("rest-cache").service("cacheStore").keys();

  beforeAll(async () => {
    process.env.RESET_STARTUP = "true";
    const appContext = await compileStrapi();
    const instance = createStrapi(appContext);

    const originalError = instance.log.error.bind(instance.log);
    instance.log.error = (...args) => {
      errors.push(args.map(String).join(" "));
      return originalError(...args);
    };

    await instance.register();

    const cacheStore = instance.plugin("rest-cache").service("cacheStore");
    const originalInit = cacheStore.init.bind(cacheStore);
    cacheStore.init = async (provider) => {
      await originalInit(provider);
      await provider.set(STALE_KEY, JSON.stringify({ stale: true }), 3600000);
    };

    // What every CLI command that is not a server does: load() and stop.
    await instance.bootstrap();
    instance.isLoaded = true;
  });

  afterAll(async () => {
    delete process.env.RESET_STARTUP;
    await teardown();
  });

  it("does not reset on a load that never starts the server", async () => {
    expect(await storedKeys()).toContain(STALE_KEY);
  });

  it("removes entries that were in the store before the server started", async () => {
    // Port 0: any free port, so parallel jest workers cannot collide.
    strapi.config.set("server.port", 0);
    strapi.config.set("server.host", "127.0.0.1");
    await strapi.listen();

    expect(await storedKeys()).not.toContain(STALE_KEY);
  });

  it("does not attempt the reset before the provider is initialized", () => {
    expect(errors).not.toContain("REST Cache provider not initialized");
  });

  it("leaves the store initialized and usable after boot", async () => {
    const cacheStore = strapi.plugin("rest-cache").service("cacheStore");
    expect(cacheStore.ready).toBe(true);
  });
});
