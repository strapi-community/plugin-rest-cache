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
 * cache poisoning by an anonymous caller. Header values had the same flaw,
 * and so did the "&" between the parts of a key.
 *
 * Escaping must not move the key of an ordinary request, or every existing
 * entry goes cold on upgrade - hence the exact keys pinned at the bottom.
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(60000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const store = () => strapi.plugin("rest-cache").service("cacheStore");

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
  });

  describe("headers", () => {
    // /api/categories/probe/vary keys on ?q, x-a and x-b, and echoes all three.

    it("does not let a comma-bearing header value collide with a second header", async () => {
      const poison = await agent()
        .get("/api/categories/probe/vary?q=1")
        .set("x-a", "fr,x-b=1");
      expect(poison.body).toEqual({ q: "1", a: "fr,x-b=1", b: null });

      const victim = await agent()
        .get("/api/categories/probe/vary?q=1")
        .set("x-a", "fr")
        .set("x-b", "1");

      expect(victim.get("x-cache")).toBe("MISS");
      expect(victim.body).toEqual({ q: "1", a: "fr", b: "1" });
    });

    it("does not let an '&' in a query value shift the header part of the key", async () => {
      // Old key for both: /api/categories/probe/vary?q=1&x-a=2&x-a=3&up:public
      const poison = await agent()
        .get("/api/categories/probe/vary")
        .query({ q: "1&x-a=2" })
        .set("x-a", "3");
      expect(poison.body).toEqual({ q: "1&x-a=2", a: "3", b: null });

      const victim = await agent()
        .get("/api/categories/probe/vary?q=1")
        .set("x-a", "2&x-a=3");

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
        "/api/categories/slug/news?locale=x%2Cpopulate=articles&&"
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

  describe("keys of ordinary requests are unchanged", () => {
    // Commas, colons, "=" and spaces are all ordinary in real values -
    // populate and sort lists, Accept-Encoding, q-weighted Accept-Language -
    // so none of these may be escaped.
    const cases = [
      [
        "a strategy-default route with lists, nesting and sort",
        { path: "/api/articles?populate=*&sort=title:asc,id&filters[title][$ne]=a,b" },
        '/api/articles?filters={"title":{"$ne":"a,b"}},populate=*,sort=title:asc,id&&',
      ],
      [
        "a custom route with an allow-list",
        { path: "/api/categories/slug/news?locale=en&populate=articles&sort=name" },
        "/api/categories/slug/news?locale=en,populate=articles&&",
      ],
      [
        "a header value with commas and spaces",
        { path: "/api/categories", headers: { "accept-encoding": "gzip, deflate, br" } },
        "/api/categories?&accept-encoding=gzip, deflate, br&up:public",
      ],
      [
        "a q-weighted header value",
        {
          path: "/api/categories/probe/vary?q=a=b",
          headers: { "x-a": "en-US,en;q=0.9", "x-b": "1" },
        },
        "/api/categories/probe/vary?q=a=b&x-a=en-US,en;q=0.9,x-b=1&up:public",
      ],
    ];

    it.each(cases)("%s", async (_name, { path, headers = {} }, expected) => {
      let req = agent().get(path);
      for (const [name, value] of Object.entries(headers)) {
        req = req.set(name, value);
      }
      const res = await req;
      expect(res.status).toBe(200);
      expect(res.get("x-cache")).toBe("MISS");

      const keys = await store().keys();
      expect(keys).toContain(expected);
    });
  });
});
