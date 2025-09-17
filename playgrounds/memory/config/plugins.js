"use strict";

module.exports = ({ env }) => ({
  "rest-cache": {
    enabled: env.bool("ENABLE_CACHE", true),
    config: {
      provider: {
        name: "memory",
        options: {
          ttl: 3600 * 1000,
          maxSize: 32767,
        }
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
});
