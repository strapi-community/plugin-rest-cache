"use strict";

module.exports = ({ env }) => ({
  // Deliberately declared AFTER rest-cache below, reproducing the plugin
  // ordering reported in
  // https://github.com/strapi-community/plugin-rest-cache/issues/119
  redis: {
    config: {
      debug: true,
      connections: {
        default: {
          connection: {
            host: env("REDIS_HOST", "127.0.0.1"),
            port: env.int("REDIS_PORT", 6379),
            // One Redis logical database per jest worker. All workers otherwise
            // share a single keyspace and clobber each other's cache entries,
            // since the cache keys are derived from the request path and are
            // identical across workers.
            // Redis only has 16 logical databases, so wrap.
            db: env.int("JEST_WORKER_ID", 0) % 16,
          },
          settings: {
            debug: false,
            cluster: false,
          },
        },
      },
      redlock: {
        enabled: true,
        databases: ["default"],
        options: {
          driftFactor: 0.01,
          retryCount: 10,
          retryDelay: 200,
          retryJitter: 200,
          automaticExtensionThreshold: 500,
        },
      },
    },
  },
  "rest-cache": {
    enabled: env.bool("ENABLE_CACHE", true),
    config: {
      provider: {
        name: "redis",
        options: {
          ttl: 32767,
          connection: "default",
        },
      },
      // loads shared config (from /shared folder)
      strategy: require("./cache-strategy")({ env }),
    },
  },
  "users-permissions": {
    config: {
      jwtSecret: env("JWT_SECRET", "b46375d2efd1c69d8efcdcb46d3acd67a"),
    },
  },
  "colour-field": {
    enabled: true,
    resolve: "./src/plugins/colour-field",
  },
});
