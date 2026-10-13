"use strict";

/**
 * Two different requests must not share a cache key.
 *
 * A key is `path?query&headers&auth`, where the query part is `name=value`
 * pairs joined with "," and the header part likewise. None of those separators
 * used to be escaped inside a value, so a single value could spell out the
 * separator and the next pair itself:
 *
 *   ?locale=x,populate=articles   -> locale=x,populate=articles
 *   ?locale=x&populate=articles   -> locale=x,populate=articles
 *
 * The first request does not populate anything (its `populate` is absent), so
 * whoever sends it first decides what the second URL serves until maxAge -
 * cache poisoning by an anonymous caller. Header values had the same flaw, so
 * did the "&" between the parts of a key, and so did a string that looks like
 * the JSON a nested query value is serialised to.
 *
 * Escaping must not move the key of an ordinary request, or every route
 * starts cold on upgrade - hence the exact keys pinned at the bottom.
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(60000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const store = () => strapi.plugin("rest-cache").service("cacheStore");

// /api/categories/probe/vary keys on ?q, x-a and x-b (and the caller), and
// echoes all three, so a response served under another request's key shows.
const VARY = "/api/categories/probe/vary";

describe("cache key separators", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();
  });
  afterAll(async () => await teardown());

  beforeEach(() => store().reset());

  describe("query params", () => {
    it("baseline: the uncached populated response includes articles", async () => {
      const res = await agent().get("/api/categories/slug/news?locale=x&populate=articles");
      expect(res.status).toBe(200);
      expect(res.body.data.articles.length).toBeGreaterThan(0);
    });

    it("does not let a comma-bearing value collide with a second parameter", async () => {
      const poison = await agent().get("/api/categories/slug/news?locale=x,populate=articles");
      expect(poison.status).toBe(200);
      // The poisoning request did not populate.
      expect(poison.body.data.articles).toBeUndefined();

      const victim = await agent().get("/api/categories/slug/news?locale=x&populate=articles");

      expect(victim.get("x-cache")).toBe("MISS");
      expect(victim.body.data.articles?.length).toBeGreaterThan(0);
    });

    it("does not let a JSON-looking string collide with a nested object", async () => {
      // Old key for both: ...?q={"a":"b"}&&up:public
      const poison = await agent().get(VARY).query({ q: '{"a":"b"}' });
      expect(poison.body.q).toBe('{"a":"b"}');

      const victim = await agent().get(`${VARY}?q[a]=b`);

      expect(victim.get("x-cache")).toBe("MISS");
      expect(victim.body.q).toEqual({ a: "b" });
    });

    it("does not let a JSON-looking string collide with an array", async () => {
      // Old key for both: ...?q=["1","2"]&&up:public
      const poison = await agent().get(VARY).query({ q: '["1","2"]' });
      expect(poison.body.q).toBe('["1","2"]');

      const victim = await agent().get(`${VARY}?q=1&q=2`);

      expect(victim.get("x-cache")).toBe("MISS");
      expect(victim.body.q).toEqual(["1", "2"]);
    });

    it("does not let a literal escape collide with an escaped separator", async () => {
      // `x,y=1` is escaped to `x%2Cy%3D1`. A caller who sends that text
      // literally must not land on the same key, so "%" is escaped too.
      const escaped = await agent().get(VARY).query({ q: "x,y=1" });
      expect(escaped.body.q).toBe("x,y=1");

      const literal = await agent().get(VARY).query({ q: "x%2Cy%3D1" });

      expect(literal.get("x-cache")).toBe("MISS");
      expect(literal.body.q).toBe("x%2Cy%3D1");
    });
  });

  describe("headers", () => {
    it("does not let a comma-bearing header value collide with a second header", async () => {
      const poison = await agent().get(`${VARY}?q=1`).set("x-a", "fr,x-b=1");
      expect(poison.body).toEqual({ q: "1", a: "fr,x-b=1", b: null });

      const victim = await agent().get(`${VARY}?q=1`).set("x-a", "fr").set("x-b", "1");

      expect(victim.get("x-cache")).toBe("MISS");
      expect(victim.body).toEqual({ q: "1", a: "fr", b: "1" });
    });

    it("does not let an '&' in a query value shift the header part of the key", async () => {
      // Old key for both: ...?q=1&x-a=2&x-a=3&up:public
      const poison = await agent().get(VARY).query({ q: "1&x-a=2" }).set("x-a", "3");
      expect(poison.body).toEqual({ q: "1&x-a=2", a: "3", b: null });

      const victim = await agent().get(`${VARY}?q=1`).set("x-a", "2&x-a=3");

      expect(victim.get("x-cache")).toBe("MISS");
      expect(victim.body).toEqual({ q: "1", a: "2&x-a=3", b: null });
    });
  });

  describe("purging", () => {
    it("still purges an entry whose key carries escapes", async () => {
      // Purge patterns are anchored on the path (`^/api/categories/slug/news\?`)
      // and escaping only ever touches what follows the "?".
      const url = "/api/categories/slug/news?locale=x,populate=articles";
      expect((await agent().get(url)).get("x-cache")).toBe("MISS");
      expect((await agent().get(url)).get("x-cache")).toBe("HIT");
      expect(await store().keys()).toContain(
        "/api/categories/slug/news?locale=x%2Cpopulate%3Darticles&&"
      );

      const [category] = await strapi
        .documents("api::category.category")
        .findMany({ filters: { slug: "news" }, limit: 1 });
      await strapi.documents("api::category.category").update({
        documentId: category.documentId,
        data: { name: "news updated" },
      });

      expect((await agent().get(url)).get("x-cache")).toBe("MISS");
    });
  });

  describe("keys", () => {
    const keyFor = async (path, headers = {}) => {
      let req = agent().get(path);
      for (const [name, value] of Object.entries(headers)) {
        req = req.set(name, value);
      }
      const res = await req;
      expect(res.status).toBe(200);
      expect(res.get("x-cache")).toBe("MISS");

      return (await store().keys()).filter((k) => !k.endsWith("_etag"));
    };

    // Commas, colons and spaces are ordinary in real values - populate and
    // sort lists, nested filters, Accept-Encoding - so none of these may move.
    // Each of these keys is exactly what main produced.
    it.each([
      [
        "comma lists, sort and a nested filter",
        "/api/articles?populate=category,author&sort=title:asc,id&filters[title][$ne]=a,b",
        {},
        '/api/articles?filters={"title":{"$ne":"a,b"}},populate=category,author,sort=title:asc,id&&',
      ],
      [
        "a nested populate",
        "/api/articles?populate[author]=true",
        {},
        '/api/articles?populate={"author":"true"}&&',
      ],
      [
        "a custom route with an allow-list",
        "/api/categories/slug/news?locale=en&populate=articles&sort=name",
        {},
        "/api/categories/slug/news?locale=en,populate=articles&&",
      ],
      [
        "a header value with commas and spaces",
        "/api/categories",
        { "accept-encoding": "gzip, deflate, br" },
        "/api/categories?&accept-encoding=gzip, deflate, br&up:public",
      ],
    ])("is unchanged for %s", async (_name, path, headers, expected) => {
      expect(await keyFor(path, headers)).toEqual([expected]);
    });

    // A value containing "=" is encoded, because values never carrying "=" is
    // what lets a key decode only one way. No header is part of a key unless
    // it is listed in useHeaders, so this moves only configured headers, and
    // costs one cold entry per value.
    it("encodes a value containing '='", async () => {
      expect(
        await keyFor(`${VARY}?q=a`, { "x-a": "en-US,en;q=0.9", "x-b": "1" })
      ).toEqual([`${VARY}?q=a&x-a=en-US%2Cen%3Bq%3D0.9,x-b=1&up:public`]);
    });
  });
});
