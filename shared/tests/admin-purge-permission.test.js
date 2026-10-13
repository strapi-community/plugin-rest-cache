"use strict";

/**
 * GET /rest-cache/purge/content-types is what the admin's purge controls fall
 * back to when the strategy is forbidden: an admin holding cache.purge but not
 * cache.read-strategy was otherwise never offered a purge control at all.
 *
 * It must be gated by cache.purge itself, return only uids, and must not have
 * been made reachable by relaxing the strategy route.
 */

const { setup, teardown, agent, adminAgent } = require("./helpers/strapi");

jest.setTimeout(60000);

process.env.STRAPI_DISABLE_UPDATE_NOTIFICATION = true;
process.env.STRAPI_HIDE_STARTUP_MESSAGE = true;
process.env.STRAPI_TELEMETRY_DISABLED = true;

const PASSWORD = "Password123";

/**
 * Create an admin holding exactly `actions` (plugin-level, no subject), and
 * return a bearer token for them.
 */
const adminWith = async (name, actions) => {
  const role = await adminAgent()
    .post("/admin/roles")
    .send({ name, description: name });
  expect(role.status).toBe(201);

  const permissions = await adminAgent()
    .put(`/admin/roles/${role.body.data.id}/permissions`)
    .send({
      permissions: actions.map((action) => ({
        action,
        subject: null,
        properties: {},
        conditions: [],
      })),
    });
  expect(permissions.status).toBe(200);

  const email = `${name}@strapi.io`;
  const created = await adminAgent()
    .post("/admin/users")
    .send({ firstname: name, lastname: "test", email, roles: [role.body.data.id] });
  expect(created.status).toBe(201);

  const registered = await agent()
    .post("/admin/register")
    .send({
      registrationToken: created.body.data.registrationToken,
      userInfo: { firstname: name, lastname: "test", password: PASSWORD },
    });
  expect(registered.status).toBe(200);

  const login = await agent()
    .post("/admin/login")
    .send({ email, password: PASSWORD });

  return login.body.data.token;
};

describe("GET /rest-cache/purge/content-types", () => {
  let purgeOnly;
  let noPlugin;

  beforeAll(async () => {
    process.env.KEYS_PREFIX = undefined;
    await setup();

    purgeOnly = await adminWith("purge-only", ["plugin::rest-cache.cache.purge"]);
    noPlugin = await adminWith("no-plugin", []);
  });
  afterAll(async () => await teardown());

  const as = (token) => (path) =>
    agent().get(path).auth(token, { type: "bearer" });

  it("is mounted and requires authentication", async () => {
    // 401, not 404: the route exists but rejected us.
    expect((await agent().get("/rest-cache/purge/content-types")).status).toBe(401);
  });

  it("is forbidden without cache.purge", async () => {
    const res = await as(noPlugin)("/rest-cache/purge/content-types");

    expect(res.status).toBe(403);
  });

  it("returns only the cached content type uids with cache.purge", async () => {
    const res = await as(purgeOnly)("/rest-cache/purge/content-types");

    expect(res.status).toBe(200);
    // Nothing else: this is served to admins who may not read the strategy,
    // so it must not leak hitpass, keys or routes.
    expect(Object.keys(res.body)).toEqual(["contentTypes"]);
    expect(res.body.contentTypes).toEqual(
      strapi.plugin("rest-cache").service("cacheConfig").getUids()
    );
    expect(res.body.contentTypes).toContain("api::article.article");
    expect(res.body.contentTypes.every((uid) => typeof uid === "string")).toBe(true);
  });

  it("leaves the strategy route behind cache.read-strategy", async () => {
    const res = await as(purgeOnly)("/rest-cache/config/strategy");

    expect(res.status).toBe(403);
  });
});
