"use strict";

/**
 * Coverage for concurrent cache misses.
 *
 * On a miss the plugin used to call the origin directly, with no in-flight
 * deduplication, so N concurrent requests for the same uncached key produced N
 * origin queries. That is the thundering herd a cache exists to prevent, and it
 * fires exactly when it hurts most: on a cold start, after a purge, and at TTL
 * expiry.
 *
 * See https://github.com/strapi-community/plugin-rest-cache/issues/130
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const UID = "api::article.article";
const CONCURRENCY = 10;

let baseUrl;

/**
 * Fire N genuinely concurrent requests.
 *
 * supertest is not usable here: a fresh agent per request opens N connections
 * and the server resets them, and a shared agent is not designed for parallel
 * use. Either way the test fails for reasons unrelated to caching. Listening on
 * a real port and using fetch gives honest concurrency.
 */
async function burst(path, n = CONCURRENCY, headers = {}) {
  const responses = await Promise.all(
    Array.from({ length: n }, () => fetch(`${baseUrl}${path}`, { headers }))
  );

  return Promise.all(
    responses.map(async (res) => ({
      status: res.status,
      body: await res.json(),
      get: (h) => res.headers.get(h),
    }))
  );
}

/** Counts origin reads, incremented by a document service middleware. */
let originReads = 0;

/**
 * Artificial origin latency.
 *
 * Without it this test passes even with no coalescing at all: an in-memory
 * response is fast enough that the first request populates the cache before
 * the others reach the handler, so they never actually overlap and the test is
 * green for the wrong reason. A slow origin guarantees the requests are in
 * flight simultaneously, which is the condition being tested.
 */
const ORIGIN_LATENCY_MS = 250;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("request coalescing", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();

    await new Promise((resolve) => strapi.server.httpServer.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${strapi.server.httpServer.address().port}`;

    // Every REST read for this content type goes through the document service,
    // so this counts actual trips to the origin rather than inferring from
    // response headers.
    strapi.documents.use(async (ctx, next) => {
      if (ctx.uid === UID && (ctx.action === "findMany" || ctx.action === "findOne")) {
        originReads += 1;
        await sleep(ORIGIN_LATENCY_MS);
      }
      return next();
    });
  });
  afterAll(async () => await teardown());

  beforeEach(async () => {
    await strapi.plugin("rest-cache").service("cacheStore").reset();
    originReads = 0;
  });

  it("hits the origin once for concurrent misses on the same key", async () => {
    const responses = await burst("/api/articles");

    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    expect(originReads).toBe(1);
  });

  it("serves every coalesced request the same body", async () => {
    const responses = await burst("/api/articles");

    const bodies = new Set(responses.map((res) => JSON.stringify(res.body)));
    expect(bodies.size).toBe(1);
    expect(responses[0].body.data.length).toBeGreaterThan(0);
  });

  it("does not coalesce across different cache keys", async () => {
    const [articles, homepage] = await Promise.all([
      fetch(`${baseUrl}/api/articles`),
      fetch(`${baseUrl}/api/articles?populate=*`),
    ]);

    expect(articles.status).toBe(200);
    expect(homepage.status).toBe(200);
    // Different query strings are different cache keys, so both must reach the
    // origin rather than one waiting on the other's result.
    expect(originReads).toBe(2);
  });

  it("populates the cache once so later requests hit", async () => {
    await burst("/api/articles");

    const after = await fetch(`${baseUrl}/api/articles`);
    expect(after.headers.get("x-cache")).toBe("HIT");
    expect(originReads).toBe(1);
  });

  it("still reaches the origin for every request that bypasses the cache", async () => {
    // hitpass requests are deliberately not cached, so they must not be
    // coalesced either - each caller needs its own uncached response.
    const responses = await burst("/api/articles", 5, { Cookie: "session=abc" });

    for (const res of responses) {
      expect(res.get("x-cache")).toBe("HITPASS");
    }
    expect(originReads).toBe(5);
  });
});
