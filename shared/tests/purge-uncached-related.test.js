"use strict";

/**
 * A write to a content type that is NOT in the cache configuration must still
 * purge cached content types whose responses embed it.
 *
 * article.author -> api::writer.writer. article is cached, writer is not.
 * `/api/articles?populate=author` therefore contains writer data, and with
 * clearRelatedCache on (the default) the docs promise related responses are
 * purged "because that response contains [its] data and is now wrong". The
 * document service middleware returned early when the written uid was
 * uncached, so the related purge never ran.
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const WRITER = "api::writer.writer";

async function warm(path) {
  const first = await agent().get(path);
  const second = await agent().get(path);
  expect(first.get("x-cache")).toBe("MISS");
  expect(second.get("x-cache")).toBe("HIT");
  return second;
}

async function renameAWriter() {
  const [writer] = await strapi.documents(WRITER).findMany({ limit: 1 });
  const name = `Renamed ${Date.now()}`;
  await strapi.documents(WRITER).update({
    documentId: writer.documentId,
    data: { name },
  });
  return name;
}

describe("purge on writes to an uncached related content type", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();
  });
  afterAll(async () => await teardown());

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  it("purges cached articles embedding a writer when that writer changes", async () => {
    expect(strapi.plugin("rest-cache").service("cacheConfig").isCached(WRITER)).toBe(false);

    const second = await warm("/api/articles?populate=author");

    const withAuthor = second.body.data.find((a) => a.author);
    expect(withAuthor).toBeDefined();

    const newName = `Renamed ${Date.now()}`;
    await strapi.documents(WRITER).update({
      documentId: withAuthor.author.documentId,
      data: { name: newName },
    });

    const after = await agent().get("/api/articles?populate=author");
    const names = after.body.data.map((a) => a.author && a.author.name);
    expect(names).toContain(newName);
  });

  // homepage reaches writer (homepage -> sections.highlight -> article ->
  // writer) but nothing on writer points back at homepage. The purge follows
  // the same direction as a cached type's related set, so homepage, whose
  // populated responses can carry writer data, is purged too.
  it("purges a cached type that reaches the writer through a component", async () => {
    await warm("/api/homepage");

    await renameAWriter();

    const after = await agent().get("/api/homepage");
    expect(after.get("x-cache")).toBe("MISS");
  });

  // editor relates to nothing, so its responses cannot contain writer data
  // and a writer write must leave them cached. (global would not do here: its
  // shared.seo component embeds sections.highlight, which reaches article.)
  it("leaves cached types that cannot embed the writer alone", async () => {
    await warm("/api/editors");

    await renameAWriter();

    const after = await agent().get("/api/editors");
    expect(after.get("x-cache")).toBe("HIT");
  });
});

describe("purge on writes to an uncached type with clearRelatedCache: false", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    process.env.CLEAR_RELATED_CACHE = "false";
    await setup();
  });
  afterAll(async () => {
    delete process.env.CLEAR_RELATED_CACHE;
    await teardown();
  });

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  // The new purge is a related purge, so it sits behind the same flag. With the
  // flag off, a write to an uncached type still purges nothing at all.
  it("purges nothing", async () => {
    await warm("/api/articles?populate=author");

    await renameAWriter();

    const after = await agent().get("/api/articles?populate=author");
    expect(after.get("x-cache")).toBe("HIT");
  });
});

/**
 * Every content type has createdBy/updatedBy relations to admin::user, and the
 * admin types relate to each other (role.users, permission.role,
 * api-token.adminUserOwner, api-token-permission.token). Followed naively, a
 * write to any of them reaches every cached type: a full flush.
 *
 * Those relations never reach a content-API response. createdBy/updatedBy are
 * `private` unless the schema sets `options.populateCreatorFields`, and the
 * content-API sanitizer removes private attributes, so the relations that
 * carry admin data into cached types are skipped. Strapi itself writes these
 * types through strapi.db.query, which this middleware does not see; this
 * covers third-party code calling strapi.documents('admin::...').
 */
const ADMIN_UIDS = [
  "admin::user",
  "admin::role",
  "admin::permission",
  "admin::api-token",
  "admin::api-token-permission",
];

/**
 * A document-service write that changes nothing but still runs the
 * middleware. Rows are created below the document service, so creating them
 * purges nothing.
 */
async function touch(uid) {
  let [row] = await strapi.db.query(uid).findMany({ limit: 1 });
  if (!row && uid === "admin::api-token") {
    row = await strapi.db.query(uid).create({
      data: {
        documentId: "purgeuncachedtoken",
        name: "purge-uncached-related",
        description: "",
        type: "read-only",
        accessKey: "purge-uncached-related",
      },
    });
  }
  if (!row && uid === "admin::api-token-permission") {
    const token = await touch("admin::api-token");
    row = await strapi.db.query(uid).create({
      data: {
        documentId: "purgeuncachedtokenperm",
        action: "api::article.article.find",
        token: token.id,
      },
    });
  }
  await strapi.documents(uid).update({ documentId: row.documentId, data: {} });
  return row;
}

describe("purge on writes to admin content types", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();
  });
  afterAll(async () => await teardown());

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  it.each(ADMIN_UIDS)("leaves cached content alone on a write to %s", async (uid) => {
    await warm("/api/articles");
    await warm("/api/editors");

    await touch(uid);

    expect((await agent().get("/api/articles")).get("x-cache")).toBe("HIT");
    expect((await agent().get("/api/editors")).get("x-cache")).toBe("HIT");
  });
});

describe("purge on writes to admin users with populateCreatorFields", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    process.env.POPULATE_CREATOR_FIELDS = "true";
    await setup();
    // An editor created by the admin user, below the document service so
    // creating it purges nothing.
    const [admin] = await strapi.db.query("admin::user").findMany({ limit: 1 });
    await strapi.db.query("api::writer.editor").create({
      data: {
        documentId: "purgeuncachedcreator",
        name: "Created by an admin",
        publishedAt: new Date(),
        createdBy: admin.id,
      },
    });
  });
  afterAll(async () => {
    delete process.env.POPULATE_CREATOR_FIELDS;
    await teardown();
  });

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  // The option makes createdBy/updatedBy public, so an admin user's name is in
  // the editor's responses and a write to that user must purge them. This is
  // why admin content types are not simply excluded.
  it("purges a cached type that exposes its creator fields", async () => {
    // The premise: the fixture really puts createdBy in the response.
    const populated = await agent().get("/api/editors?populate=createdBy");
    expect(populated.status).toBe(200);
    expect(populated.body.data[0].createdBy).toMatchObject({ firstname: "admin" });

    await warm("/api/editors");
    await warm("/api/articles");

    await touch("admin::user");

    expect((await agent().get("/api/editors")).get("x-cache")).toBe("MISS");
    // Articles keep their creator fields private.
    expect((await agent().get("/api/articles")).get("x-cache")).toBe("HIT");
  });

  // A role is reachable from a user only through the private `roles`
  // relation, so no response that carries a user carries its roles.
  it("leaves it alone on a write to a role", async () => {
    await warm("/api/editors");

    await touch("admin::role");

    expect((await agent().get("/api/editors")).get("x-cache")).toBe("HIT");
  });
});
