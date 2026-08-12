"use strict";

const { join } = require("path");

module.exports = ({ env }) => ({
  connection: {
    client: "sqlite",
    connection: {
      // One database file per jest worker, so test files can run in parallel.
      // With a single shared file, concurrent workers race on schema creation
      // and fail with "table `strapi_database_schema` already exists".
      filename: join(
        __dirname,
        "../../../",
        env("DATABASE_FILENAME", `.tmp/tests-${env("JEST_WORKER_ID", "1")}.db`)
      ),
    },
    useNullAsDefault: true,
  },
});
