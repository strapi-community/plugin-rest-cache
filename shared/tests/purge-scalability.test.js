"use strict";

/**
 * Coverage for how a purge removes entries, not just that it does.
 *
 * clearByRegexp used to enumerate the whole keyspace and then issue one delete
 * per matching key through an unbounded Promise.all. On redis that is a round
 * trip per key, and enumeration itself SCANned the entire keyspace and MGETted
 * every value purely to read key names.
 *
 * See https://github.com/strapi-community/plugin-rest-cache/issues/131
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const store = () => strapi.plugin("rest-cache").service("cacheStore");

describe("purge scalability", () => {
  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();
  });
  afterAll(async () => await teardown());

  beforeEach(() => store().reset());

  it("exposes a batched delete", () => {
    expect(typeof store().delMany).toBe("function");
  });

  it("deletes many keys in a single provider call", async () => {
    const target = store();

    // Wrap the store's own delMany so we can count how the purge path uses it,
    // without needing access to the private provider instance.
    const calls = [];
    const original = target.delMany.bind(target);
    target.delMany = async (keys) => {
      calls.push(keys.length);
      return original(keys);
    };

    try {
      for (let i = 0; i < 25; i += 1) {
        await target.set(`/api/articles?page=${i}&`, { page: i }, 60000);
      }
      expect((await target.keys()).length).toBeGreaterThanOrEqual(25);

      await target.clearByRegexp([/^\/api\/articles/]);

      // One batched call, not one per key.
      expect(calls).toHaveLength(1);
      expect(calls[0]).toBeGreaterThanOrEqual(25);
    } finally {
      target.delMany = original;
    }
  });

  it("removes exactly the matching keys", async () => {
    const target = store();

    await target.set("/api/articles?&", { a: 1 }, 60000);
    await target.set("/api/articles/1?&", { a: 2 }, 60000);
    await target.set("/api/homepage?&", { h: 1 }, 60000);

    await target.clearByRegexp([/^\/api\/articles/]);

    const remaining = await target.keys();
    expect(remaining).toContain("/api/homepage?&");
    expect(remaining.filter((k) => k.startsWith("/api/articles"))).toHaveLength(0);
  });

  it("reset removes every entry", async () => {
    const target = store();

    await target.set("/api/articles?&", { a: 1 }, 60000);
    await target.set("/api/homepage?&", { h: 1 }, 60000);
    expect((await target.keys()).length).toBeGreaterThan(0);

    await target.reset();

    expect(await target.keys()).toHaveLength(0);
  });

  it("purging a content type still invalidates its cached responses", async () => {
    const first = await agent().get("/api/articles");
    const second = await agent().get("/api/articles");
    expect(first.get("x-cache")).toBe("MISS");
    expect(second.get("x-cache")).toBe("HIT");

    await store().clearByUid("api::article.article", {}, true);

    const third = await agent().get("/api/articles");
    expect(third.get("x-cache")).toBe("MISS");
  });

  it("tolerates a purge that matches nothing", async () => {
    await expect(store().clearByRegexp([/^\/api\/nothing-here/])).resolves.not.toThrow();
  });
});
