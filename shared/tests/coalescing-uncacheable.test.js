"use strict";

/**
 * Request coalescing must not share a response the plugin refuses to store.
 *
 * The docs promise coalescing "only ever merges requests that would have
 * shared an entry anyway", and that a refused response "is still returned to
 * the client as normal". recv publishes the leader's ctx.body to every waiter
 * BEFORE isCacheable runs, so a response isCacheable refuses (stream, raw
 * socket, Set-Cookie, Cache-Control: private/no-store) is still handed to
 * every concurrent caller on the same key.
 */

const { setup, teardown } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const CONCURRENCY = 4;
// Holds the origin open long enough that every request overlaps the leader.
const DELAY = 300;

let baseUrl;

async function burst(path, headersFor = () => ({})) {
  const responses = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) =>
      fetch(`${baseUrl}${path}`, { headers: headersFor(i) })
    )
  );

  return Promise.all(
    responses.map(async (res) => {
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      return {
        status: res.status,
        body,
        setCookie: res.headers.get("set-cookie"),
      };
    })
  );
}

describe("coalescing of uncacheable responses", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();
    await new Promise((resolve) => strapi.server.httpServer.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${strapi.server.httpServer.address().port}`;
  });
  afterAll(async () => await teardown());

  beforeEach(() => strapi.plugin("rest-cache").service("cacheStore").reset());

  it("does not hand a Cache-Control: private response to other callers", async () => {
    const responses = await burst(
      `/api/categories/probe/cache-control?value=private&delay=${DELAY}`,
      (i) => ({ "x-caller": `caller-${i}` })
    );

    // Each caller must get its own response, not the leader's.
    expect(responses.map((r) => r.body.caller)).toEqual(
      Array.from({ length: CONCURRENCY }, (_, i) => `caller-${i}`)
    );
  });

  it("gives every concurrent caller its own Set-Cookie", async () => {
    const responses = await burst(`/api/categories/probe/with-cookie?delay=${DELAY}`);

    for (const res of responses) {
      expect(res.setCookie).not.toBeNull();
    }
  });

  it("serves a streamed body intact to every concurrent caller", async () => {
    const responses = await burst(`/api/categories/probe/stream?delay=${DELAY}`);

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ streamed: true });
    }
  });

  it("serves a ctx.respond = false response intact to every concurrent caller", async () => {
    const responses = await burst(`/api/categories/probe/raw?delay=${DELAY}`);

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ raw: true });
    }
  });

  // Waiters are released by the leader publishing or abandoning. If deciding
  // whether the response is cacheable throws, neither happened, and every
  // concurrent caller waited forever.
  it("never leaves concurrent callers waiting when the verdict throws", async () => {
    const settled = await Promise.race([
      burst(`/api/categories/probe/throwing-body?delay=${DELAY}`).then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 10000)),
    ]);

    expect(settled).toBe(true);
  });
});
