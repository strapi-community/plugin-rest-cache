"use strict";

/**
 * Boots the playground for benchmarking.
 *
 * NODE_ENV defaults to `test` so the sqlite file from config/env/test is used,
 * but it can be overridden - benchmarking under `production` is closer to what
 * users actually run.
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

const { createStrapi, compileStrapi } = require("@strapi/strapi");

async function setup() {
  const appContext = await compileStrapi();
  const instance = await createStrapi(appContext).load();

  await instance.start();

  return instance;
}

setup()
  // eslint-disable-next-line no-console
  .then(() => console.log("[bench] server ready"))
  // eslint-disable-next-line no-console
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
