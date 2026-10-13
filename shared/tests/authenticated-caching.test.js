"use strict";

/**
 * Coverage for caching authenticated requests.
 *
 * The default hitpass never caches a request carrying an authorization or
 * cookie header, which is safe but means authenticated traffic is never
 * accelerated. Turning hitpass off makes those responses cacheable - and
 * without keying on the caller, two people authorised for the same route share
 * one entry, so whoever misses first decides what everybody else sees.
 *
 * `keys: { useAuth: true }` puts the caller's identity in the key.
 *
 * api::category.category is configured with hitpass: false and useAuth: true.
 *
 * See https://github.com/strapi-community/plugin-rest-cache/issues/113
 */

const { setup, teardown, agent } = require("./helpers/strapi");

jest.setTimeout(90000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const store = () => strapi.plugin("rest-cache").service("cacheStore");

/** Creates a users-permissions user and returns a JWT for them. */
async function createUser(username) {
  const role = await strapi
    .query("plugin::users-permissions.role")
    .findOne({ where: { type: "authenticated" } });

  const user = await strapi.query("plugin::users-permissions.user").create({
    data: {
      username,
      email: `${username}@example.com`,
      password: "Password123",
      confirmed: true,
      blocked: false,
      role: role.id,
      provider: "local",
    },
  });

  const jwt = strapi
    .plugin("users-permissions")
    .service("jwt")
    .issue({ id: user.id });

  return { user, jwt };
}

describe("authenticated caching", () => {
  let alice;
  let bob;

  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();

    // The authenticated role needs read access for the JWTs to get through.
    const role = await strapi
      .query("plugin::users-permissions.role")
      .findOne({ where: { type: "authenticated" } });

    for (const action of [
      "api::category.category.find",
      "api::category.category.findBySlug",
      "api::category.category.inherits",
      "api::article.article.find",
    ]) {
      await strapi.query("plugin::users-permissions.permission").create({
        data: { action, role: role.id },
      });
    }

    alice = await createUser("alice");
    bob = await createUser("bob");
  });
  afterAll(async () => await teardown());

  beforeEach(() => store().reset());

  it("caches an authenticated request when hitpass is disabled", async () => {
    const first = await agent()
      .get("/api/categories")
      .set("Authorization", `Bearer ${alice.jwt}`);
    const second = await agent()
      .get("/api/categories")
      .set("Authorization", `Bearer ${alice.jwt}`);

    expect(first.status).toBe(200);
    expect(first.get("x-cache")).toBe("MISS");
    expect(second.get("x-cache")).toBe("HIT");
  });

  it("does not serve one user's entry to another", async () => {
    const forAlice = await agent()
      .get("/api/categories")
      .set("Authorization", `Bearer ${alice.jwt}`);
    const forBob = await agent()
      .get("/api/categories")
      .set("Authorization", `Bearer ${bob.jwt}`);

    expect(forAlice.get("x-cache")).toBe("MISS");
    // Bob must not inherit Alice's entry.
    expect(forBob.get("x-cache")).toBe("MISS");
  });

  // A listed route takes its content type's hitpass: false only when its keys
  // identify the caller. /api/categories/probe/inherits has no keys of its
  // own, so it gets the content type's useAuth: true. See
  // https://github.com/strapi-community/plugin-rest-cache/issues/230
  it("caches a listed route per caller when it inherits hitpass: false", async () => {
    const route = "/api/categories/probe/inherits";
    const forAlice = await agent().get(route).set("Authorization", `Bearer ${alice.jwt}`);
    const againForAlice = await agent()
      .get(route)
      .set("Authorization", `Bearer ${alice.jwt}`);
    const forBob = await agent().get(route).set("Authorization", `Bearer ${bob.jwt}`);

    expect(forAlice.status).toBe(200);
    expect(forAlice.get("x-cache")).toBe("MISS");
    expect(againForAlice.get("x-cache")).toBe("HIT");
    // Bob must not inherit Alice's entry.
    expect(forBob.get("x-cache")).toBe("MISS");
  });

  // /api/categories/slug/:slug+ sets keys of its own without useAuth, so its
  // entries would be shared by every caller. It must keep bypassing
  // authenticated requests, as it always has, rather than take the content
  // type's hitpass: false. See
  // https://github.com/strapi-community/plugin-rest-cache/issues/230
  it("keeps bypassing authenticated requests on a listed route whose keys do not identify the caller", async () => {
    const forAlice = await agent()
      .get("/api/categories/slug/news")
      .set("Authorization", `Bearer ${alice.jwt}`);
    const forBob = await agent()
      .get("/api/categories/slug/news")
      .set("Authorization", `Bearer ${bob.jwt}`);

    expect(forAlice.status).toBe(200);
    expect(forAlice.get("x-cache")).toBe("HITPASS");
    expect(forBob.get("x-cache")).toBe("HITPASS");
  });

  it("does not serve an authenticated entry to an anonymous caller", async () => {
    const authed = await agent()
      .get("/api/categories")
      .set("Authorization", `Bearer ${alice.jwt}`);
    const anonymous = await agent().get("/api/categories");

    expect(authed.get("x-cache")).toBe("MISS");
    expect(anonymous.get("x-cache")).toBe("MISS");
  });

  it("keys every caller separately in the store", async () => {
    await agent().get("/api/categories").set("Authorization", `Bearer ${alice.jwt}`);
    await agent().get("/api/categories").set("Authorization", `Bearer ${bob.jwt}`);
    await agent().get("/api/categories");

    // ETag is enabled, so each entry has a companion "<key>_etag"; count only
    // the body keys.
    const keys = (await store().keys()).filter(
      (k) => k.startsWith("/api/categories?") && !k.endsWith("_etag")
    );

    expect(new Set(keys).size).toBe(3);
    expect(keys.some((k) => k.endsWith(`up:${alice.user.id}`))).toBe(true);
    expect(keys.some((k) => k.endsWith(`up:${bob.user.id}`))).toBe(true);
    expect(keys.some((k) => k.endsWith("up:public"))).toBe(true);
  });

  it("never puts credentials in the key", async () => {
    await agent().get("/api/categories").set("Authorization", `Bearer ${alice.jwt}`);

    const keys = await store().keys();

    // The users-permissions credentials object is the raw user row, including
    // the password hash and reset tokens.
    for (const key of keys) {
      expect(key).not.toContain("$2a$");
      expect(key).not.toContain("$2b$");
      expect(key).not.toContain(alice.user.email);
      expect(key).not.toContain(alice.jwt);
    }
  });

  it("still purges authenticated entries", async () => {
    await agent().get("/api/categories").set("Authorization", `Bearer ${alice.jwt}`);
    await agent().get("/api/categories").set("Authorization", `Bearer ${bob.jwt}`);

    const hit = await agent()
      .get("/api/categories")
      .set("Authorization", `Bearer ${alice.jwt}`);
    expect(hit.get("x-cache")).toBe("HIT");

    // Purge regexes are anchored on the route path, so an identity component
    // placed in front of it would leave these entries permanently stale.
    const [category] = await strapi
      .documents("api::category.category")
      .findMany({ limit: 1 });
    await strapi.documents("api::category.category").update({
      documentId: category.documentId,
      data: { name: "renamed" },
    });

    const after = await agent()
      .get("/api/categories")
      .set("Authorization", `Bearer ${alice.jwt}`);
    expect(after.get("x-cache")).toBe("MISS");
  });

  it("leaves content types using the default hitpass uncached", async () => {
    const first = await agent()
      .get("/api/articles")
      .set("Authorization", `Bearer ${alice.jwt}`);

    expect(first.get("x-cache")).toBe("HITPASS");
  });
});
