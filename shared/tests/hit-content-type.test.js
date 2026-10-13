"use strict";

/**
 * Coverage for the Content-Type of a response served from the cache.
 *
 * Only the body used to be stored. On a HIT the plugin assigned it back to
 * ctx.body and Koa guessed a type from it: an object is JSON, so JSON routes
 * were unaffected, but a string is `text/plain`, or `text/html` if it starts
 * with `<`. A handler returning CSV served `text/csv` on the MISS and
 * `text/plain` on every HIT after it; XML with a prolog became `text/html`.
 *
 * Entries written before the type was stored must keep being served exactly as
 * they were, so these tests also write that older shape straight through the
 * provider and read it back.
 */

const path = require("path");
const { setup, teardown } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const store = () => strapi.plugin("rest-cache").service("cacheStore");

const CSV = "a,b\n1,2\n";
const XML = '<?xml version="1.0" encoding="UTF-8"?>\n<probe>xml</probe>\n';

let baseUrl;
let provider;
let keysPrefix;

/**
 * A provider instance of our own, installed as the store's provider, so the
 * test can read and write raw entries beneath the plugin's serializer.
 *
 * The store does not expose the instance bootstrap created. The redis instance
 * shares the configured connection, so it sees the same keyspace either way.
 */
async function installOwnProvider() {
  const { provider: config } = strapi.config.get("plugin::rest-cache");
  const packageName = `@strapi-community/provider-rest-cache-${config.name}`;

  // The redis provider is the application's dependency, the memory provider
  // the plugin's - the same two places bootstrap looks.
  const modulePath = require.resolve(packageName, {
    paths: [
      strapi.dirs.app.root,
      path.join(strapi.dirs.app.root, "node_modules/@strapi-community/plugin-rest-cache"),
    ],
  });

  provider = await require(modulePath).init(config.options ?? {}, { strapi });
  await store().init(provider);
}

async function get(urlPath, headers = {}) {
  const res = await fetch(`${baseUrl}${urlPath}`, { headers });
  return {
    status: res.status,
    text: await res.text(),
    type: res.headers.get("content-type"),
    xCache: res.headers.get("x-cache"),
    etag: res.headers.get("etag"),
  };
}

/** The logical cache key of the body (not the ETag) stored for a path. */
async function keyFor(fragment) {
  const keys = (await store().keys()) ?? [];
  const matches = keys.filter((k) => k.includes(fragment) && !k.endsWith("_etag"));
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe("Content-Type on a cache HIT", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();

    await new Promise((resolve) => strapi.server.httpServer.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${strapi.server.httpServer.address().port}`;

    keysPrefix = strapi.config.get("plugin::rest-cache").strategy.keysPrefix;
    await installOwnProvider();
  });
  afterAll(async () => await teardown());

  beforeEach(() => store().reset());

  // The full header the handler's ctx.type produces. Koa only adds a charset
  // where mime-db knows one, which it does for text/csv but not for XML.
  describe.each([
    ["text/csv; charset=utf-8", "/api/categories/probe/csv", CSV],
    ["application/xml", "/api/categories/probe/xml", XML],
  ])("a %s string body", (type, urlPath, body) => {
    it("keeps the handler's type on a HIT", async () => {
      const miss = await get(urlPath);
      const hit = await get(urlPath);

      expect(miss.xCache).toBe("MISS");
      expect(miss.type).toBe(type);

      expect(hit.xCache).toBe("HIT");
      expect(hit.type).toBe(miss.type);
      expect(hit.text).toBe(body);
      expect(hit.etag).toBe(miss.etag);
    });

    it("keeps the handler's type for coalesced requests", async () => {
      // A slow origin, so the burst genuinely overlaps and all but one of
      // these requests are served the leader's body rather than their own.
      const burst = await Promise.all(
        Array.from({ length: 5 }, () => get(`${urlPath}?delay=300`))
      );

      for (const res of burst) {
        expect(res.status).toBe(200);
        expect(res.xCache).toBe("MISS");
        expect(res.type).toBe(type);
        expect(res.text).toBe(body);
      }
    });
  });

  describe("JSON", () => {
    it("serves the same bytes and Content-Type on a HIT as before", async () => {
      const miss = await get("/api/categories");
      const hit = await get("/api/categories");

      expect(miss.xCache).toBe("MISS");
      expect(hit.xCache).toBe("HIT");
      expect(miss.type).toBe("application/json; charset=utf-8");
      expect(hit.type).toBe("application/json; charset=utf-8");
      expect(hit.text).toBe(miss.text);
    });

    it("stores a JSON entry in the same shape as before", async () => {
      await get("/api/categories");

      const raw = await provider.get(`${keysPrefix}${await keyFor("/api/categories")}`);

      // Only string bodies need their type kept; a JSON entry must not change,
      // so that an older plugin version sharing the store reads it unchanged.
      expect(Object.keys(JSON.parse(raw))).toEqual(["data"]);
    });
  });

  /**
   * The type comes from the one caller whose request reached the origin. Where
   * a handler chooses it from something outside the cache key, replaying it
   * lets that caller choose it for everyone: ask for HTML once, and every
   * later caller is served user-supplied markup as HTML - stored XSS. Before
   * types were kept, Koa inferred the type from the body alone, the same way
   * for every caller, so no caller could choose it.
   */
  describe("a type chosen by one caller", () => {
    const NEGOTIATED = "/api/categories/probe/negotiated";
    const BODY = "hello <script>alert(1)</script>\n";
    // What Koa infers for that body, and so what every HIT served before.
    const INFERRED = "text/plain; charset=utf-8";

    it("is not replayed as HTML to later callers", async () => {
      const first = await get(NEGOTIATED, { Accept: "text/html" });
      // The first caller asked for HTML and is given it: that is their own
      // response, straight from the handler.
      expect(first.xCache).toBe("MISS");
      expect(first.type).toBe("text/html; charset=utf-8");

      // Refused when storing, too: the entry keeps the older, type-less shape.
      const raw = await provider.get(
        `${keysPrefix}${await keyFor("/categories/probe/negotiated")}`
      );
      expect(Object.keys(JSON.parse(raw))).toEqual(["data"]);

      const later = await get(NEGOTIATED);

      expect(later.xCache).toBe("HIT");
      expect(later.text).toBe(BODY);
      expect(later.type).toBe(INFERRED);
    });

    it("is not handed to coalesced requests as HTML", async () => {
      const url = `${NEGOTIATED}?delay=300`;
      const leader = get(url, { Accept: "text/html" });
      // Let the leader reach the origin first, so the rest wait on it.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const waiters = await Promise.all(Array.from({ length: 4 }, () => get(url)));

      expect((await leader).type).toBe("text/html; charset=utf-8");
      for (const res of waiters) {
        expect(res.xCache).toBe("MISS");
        expect(res.text).toBe(BODY);
        expect(res.type).toBe(INFERRED);
      }
    });

    // Entries are checked again when read, not only when written, so an entry
    // stored by anything else - or before this check existed - cannot carry
    // an active type into a response either.
    it.each([
      "text/html; charset=utf-8",
      "application/xhtml+xml",
      "image/svg+xml",
      "text/xml",
      "application/xml",
      "text/javascript; charset=utf-8",
      "text/css",
      "text/plain; charset=utf-7",
    ])("does not replay a stored %s for a body Koa would serve as text", async (type) => {
      await get(NEGOTIATED);
      const key = await keyFor("/categories/probe/negotiated");

      await provider.set(`${keysPrefix}${key}`, JSON.stringify({ data: BODY, type }), 60000);

      const hit = await get(NEGOTIATED);

      expect(hit.xCache).toBe("HIT");
      expect(hit.text).toBe(BODY);
      expect(hit.type).toBe(INFERRED);
    });

    it.each(["application/xhtml+xml", "image/svg+xml", "text/xml", "text/javascript"])(
      "does not replay a stored %s for markup either",
      async (type) => {
        await get("/api/categories/probe/xml");
        const key = await keyFor("/categories/probe/xml");

        await provider.set(`${keysPrefix}${key}`, JSON.stringify({ data: XML, type }), 60000);

        const hit = await get("/api/categories/probe/xml");

        expect(hit.xCache).toBe("HIT");
        // Koa's inference for a body starting with `<`, as before types were kept.
        expect(hit.type).toBe("text/html; charset=utf-8");
      }
    );
  });

  describe("an entry written before the type was stored", () => {
    it("serves a string body exactly as before", async () => {
      await get("/api/categories/probe/csv");
      const key = await keyFor("/categories/probe/csv");

      // The shape every earlier version wrote: the body alone.
      await provider.set(`${keysPrefix}${key}`, JSON.stringify({ data: CSV }), 60000);

      const hit = await get("/api/categories/probe/csv");

      expect(hit.xCache).toBe("HIT");
      expect(hit.text).toBe(CSV);
      // No type was stored, so none is restored: Koa infers one, as it always
      // did for these entries.
      expect(hit.type).toBe("text/plain; charset=utf-8");
    });

    it("serves a JSON body exactly as before", async () => {
      await get("/api/categories");
      const key = await keyFor("/api/categories");

      const data = { data: [{ id: 1, legacy: true }], meta: {} };
      await provider.set(`${keysPrefix}${key}`, JSON.stringify({ data }), 60000);

      const hit = await get("/api/categories");

      expect(hit.xCache).toBe("HIT");
      expect(hit.type).toBe("application/json; charset=utf-8");
      expect(hit.text).toBe(JSON.stringify(data));
    });
  });
});
