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
 * Caching those routes is only safe if they are also purged. Several plugins
 * write their own content types with strapi.db.query rather than the document
 * service - users-permissions' user.remove, upload's file create, update and
 * remove, i18n's locales - so the document service middleware never sees those
 * writes. While these routes were never cached a missed purge could not serve
 * anything stale; once they are cached it serves a deleted user or file until
 * maxAge.
 *
 * The fixture entries are behind CACHE_PLUGIN_USERS and CACHE_PLUGIN_UPLOAD so
 * no other spec sees them.
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const USER = "plugin::users-permissions.user";
const FILE = "plugin::upload.file";

async function warm(path) {
  await agent().get(path);
  const warmed = await agent().get(path);
  expect(warmed.get("x-cache")).toBe("HIT");
}

async function createUser(username) {
  const role = await strapi
    .query("plugin::users-permissions.role")
    .findOne({ where: { type: "authenticated" } });

  // add() goes through the document service.
  return strapi.plugin("users-permissions").service("user").add({
    username,
    email: `${username}@strapi.io`,
    password: "Password123",
    provider: "local",
    confirmed: true,
    role: role.id,
  });
}

/**
 * A file row as the upload service stores it, written the way upload writes
 * it: strapi.db.query. The provider is deliberately not the configured one, so
 * upload's remove() skips deleting a physical file that was never written and
 * goes straight to its own strapi.db.query delete.
 */
function createFileRow(name) {
  return strapi.db.query(FILE).create({
    data: {
      name,
      hash: name,
      ext: ".txt",
      mime: "text/plain",
      size: 1,
      url: `/uploads/${name}.txt`,
      provider: "rest-cache-test",
    },
  });
}

const names = (res) => res.body.map((entry) => entry.name ?? entry.username);

describe("plugin content type with listed routes", () => {
  beforeAll(async () => {
    process.env.CACHE_PLUGIN_USERS = "true";
    process.env.CACHE_PLUGIN_UPLOAD = "true";
    await setup();

    // Let anonymous callers list users and files, so the request carries no
    // authorization header and the default hitpass does not bypass it. Granted
    // only for the routes under test, and only in this spec's database.
    const publicRole = await strapi
      .query("plugin::users-permissions.role")
      .findOne({ where: { type: "public" } });
    for (const action of [
      "plugin::users-permissions.user.find",
      "plugin::upload.content-api.find",
    ]) {
      await strapi.query("plugin::users-permissions.permission").create({
        data: { action, role: publicRole.id },
      });
    }
  });

  afterAll(async () => {
    delete process.env.CACHE_PLUGIN_USERS;
    delete process.env.CACHE_PLUGIN_UPLOAD;
    await teardown();
  });

  it("resolves the plugin content type into the strategy", () => {
    expect(
      strapi.plugin("rest-cache").service("cacheConfig").isCached(USER)
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
    await warm("/api/users");

    await createUser("cached-route-purge");

    const after = await agent().get("/api/users");
    expect(after.get("x-cache")).toBe("MISS");
    expect(names(after)).toContain("cached-route-purge");
  });

  it("purges GET /api/users when a user is removed through users-permissions", async () => {
    // user.remove() deletes with strapi.db.query, not the document service,
    // and it is exactly what DELETE /api/users/:id calls.
    const user = await createUser("removed-while-cached");
    await warm("/api/users");

    await strapi
      .plugin("users-permissions")
      .service("user")
      .remove({ id: user.id });

    const after = await agent().get("/api/users");
    expect(after.get("x-cache")).toBe("MISS");
    expect(names(after)).not.toContain("removed-while-cached");
  });

  it("purges a document service write once, not again for its database writes", async () => {
    // The document service writes through strapi.db.query, so its writes fire
    // database lifecycles too. The document service middleware already purges
    // them; purging again from the lifecycle would double every purge.
    const cacheStore = strapi.plugin("rest-cache").service("cacheStore");
    const spy = jest.spyOn(cacheStore, "clearByUid");
    try {
      await createUser("purged-once");
      expect(spy.mock.calls.filter(([uid]) => uid === USER)).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("leaves application content types to explicit purges, as documented", async () => {
    // docs/guide/invalidation/purging.md tells application code that writes
    // with strapi.db.query to call clearByUid itself. Purging per database
    // event there would turn a bulk import loop into one wildcard purge per
    // row, so only plugin content types are hooked.
    const article = await strapi
      .db.query("api::article.article")
      .findOne({ where: { publishedAt: { $notNull: true } } });
    await warm("/api/articles");

    await strapi.db.query("api::article.article").update({
      where: { id: article.id },
      data: { title: "Written by application code with db.query" },
    });

    const after = await agent().get("/api/articles");
    expect(after.get("x-cache")).toBe("HIT");
  });

  describe("upload files, written only through strapi.db.query", () => {
    it("caches GET /api/upload/files", async () => {
      const first = await agent().get("/api/upload/files");
      const second = await agent().get("/api/upload/files");

      expect(first.status).toBe(200);
      expect(second.get("x-cache")).toBe("HIT");
    });

    it("purges when a file is created", async () => {
      await warm("/api/upload/files");

      await createFileRow("created-while-cached");

      const after = await agent().get("/api/upload/files");
      expect(after.get("x-cache")).toBe("MISS");
      expect(names(after)).toContain("created-while-cached");
    });

    it("purges when a file is updated through the upload service", async () => {
      const file = await createFileRow("renamed-while-cached");
      await warm("/api/upload/files");

      await strapi
        .plugin("upload")
        .service("upload")
        .updateFileInfo(file.id, { name: "renamed-after-cache" });

      const after = await agent().get("/api/upload/files");
      expect(after.get("x-cache")).toBe("MISS");
      expect(names(after)).toContain("renamed-after-cache");
    });

    it("purges when a file is removed through the upload service", async () => {
      const file = await createFileRow("removed-file-while-cached");
      await warm("/api/upload/files");

      await strapi.plugin("upload").service("upload").remove(file);

      const after = await agent().get("/api/upload/files");
      expect(after.get("x-cache")).toBe("MISS");
      expect(names(after)).not.toContain("removed-file-while-cached");
    });

    it("purges after a bulk deleteMany", async () => {
      await createFileRow("bulk-deleted-while-cached");
      await warm("/api/upload/files");

      await strapi.db
        .query(FILE)
        .deleteMany({ where: { name: "bulk-deleted-while-cached" } });

      const after = await agent().get("/api/upload/files");
      expect(after.get("x-cache")).toBe("MISS");
      expect(names(after)).not.toContain("bulk-deleted-while-cached");
    });
  });
});
