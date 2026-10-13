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
