"use strict";

/**
 * A purge must win against a cache miss that was already reading the origin
 * when the write happened.
 *
 * Request A misses and reads the database. Before A's response is stored, a
 * write lands and purges. Then:
 *  1. request B, issued strictly AFTER the write has returned, finds A still in
 *     the in-flight map and is coalesced onto A's pre-write body;
 *  2. A stores its pre-write body after the purge already ran, so the stale
 *     response then survives until maxAge.
 *
 * Awaiting the store (#132) does not help: the read happened before the write.
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const UID = "api::article.article";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let baseUrl;
// Latency injected AFTER the origin read, so the body is already pre-write
// data while the request is still in flight.
let slowReads = false;

const titles = (body) => body.data.map((a) => a.title);

describe("purge racing an in-flight miss", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();

    await new Promise((resolve) => strapi.server.httpServer.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${strapi.server.httpServer.address().port}`;

    strapi.documents.use(async (ctx, next) => {
      const result = await next();
      if (slowReads && ctx.uid === UID && ctx.action === "findMany") {
        await sleep(800);
      }
      return result;
    });
  });
  afterAll(async () => await teardown());

  beforeEach(async () => {
    await strapi.plugin("rest-cache").service("cacheStore").reset();
    slowReads = false;
  });

  async function writeDuringInFlightRead(newTitle) {
    const [article] = await strapi
      .documents(UID)
      .findMany({ status: "published", limit: 1 });

    slowReads = true;
    // A: misses, reads the origin, then stalls before storing.
    const inFlight = fetch(`${baseUrl}/api/articles`).then((r) => r.json());
    await sleep(300);

    // The write (and its awaited purge) completes while A is still in flight.
    await strapi.documents(UID).update({
      documentId: article.documentId,
      data: { title: newTitle },
    });
    await strapi.documents(UID).publish({ documentId: article.documentId });
    slowReads = false;

    return { inFlight };
  }

  it("serves fresh data to a read issued after the write returned", async () => {
    const newTitle = `fresh-${Date.now()}`;
    // Resolves once the write has returned; A is still stalled (800ms).
    const { inFlight } = await writeDuringInFlightRead(newTitle);

    const afterWrite = await fetch(`${baseUrl}/api/articles`);
    const body = await afterWrite.json();
    await inFlight;

    expect(titles(body)).toContain(newTitle);
  });

  it("does not store a body read before the purge", async () => {
    const newTitle = `stored-${Date.now()}`;
    const { inFlight } = await writeDuringInFlightRead(newTitle);
    await inFlight;

    // Control: bypassing the cache shows the write did land and is published.
    const origin = await agent().get("/api/articles").set("Cookie", "bypass=1");
    expect(origin.get("x-cache")).toBe("HITPASS");
    expect(titles(origin.body)).toContain(newTitle);

    // Whether or not anything is cached now, nothing may serve the pre-write
    // body: the first read is either a fresh MISS or a HIT on fresh data, and
    // the one after it is a HIT on fresh data.
    const later = await agent().get("/api/articles");
    expect(titles(later.body)).toContain(newTitle);

    const cached = await agent().get("/api/articles");
    expect(cached.get("x-cache")).toBe("HIT");
    expect(titles(cached.body)).toContain(newTitle);
  });

  // The narrower window: the origin read finished before the write, but the
  // store write is still in progress when the purge lists the keys, so the
  // purge does not see the entry and does not delete it. The write then lands
  // a pre-write body after the purge.
  it("does not keep a body whose store raced the purge", async () => {
    const newTitle = `racing-store-${Date.now()}`;
    const [article] = await strapi
      .documents(UID)
      .findMany({ status: "published", limit: 1 });

    const store = strapi.plugin("rest-cache").service("cacheStore");
    const set = store.set;
    let storeStarted;
    const started = new Promise((resolve) => (storeStarted = resolve));
    store.set = async (...args) => {
      storeStarted();
      await sleep(500);
      return set.apply(store, args);
    };

    try {
      const inFlight = fetch(`${baseUrl}/api/articles`).then((r) => r.json());
      await started;

      await strapi.documents(UID).update({
        documentId: article.documentId,
        data: { title: newTitle },
      });
      await strapi.documents(UID).publish({ documentId: article.documentId });

      await inFlight;
    } finally {
      store.set = set;
    }

    const later = await agent().get("/api/articles");
    expect(titles(later.body)).toContain(newTitle);
  });

  // The guard is scoped to the purges that match the in-flight key. A purge of
  // an unrelated content type must not cost the in-flight read its cache
  // entry, or a steady stream of unrelated writes would stop anything from
  // being cached. editor relates to nothing, so its purge never touches
  // /api/articles.
  it("still stores a read that only raced an unrelated purge", async () => {
    const editor = await strapi
      .documents("api::writer.editor")
      .create({ data: { name: `unrelated-${Date.now()}` } });

    slowReads = true;
    const inFlight = fetch(`${baseUrl}/api/articles`).then((r) => r.json());
    await sleep(300);

    await strapi.documents("api::writer.editor").update({
      documentId: editor.documentId,
      data: { name: `unrelated-${Date.now()}` },
    });
    slowReads = false;
    await inFlight;

    const later = await agent().get("/api/articles");
    expect(later.get("x-cache")).toBe("HIT");
  });
});
