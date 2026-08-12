"use strict";

module.exports = async () => ({
  preset: 'ts-jest',
  verbose: true,
  // Every test file boots its own Strapi instance, which is CPU and memory
  // heavy. Runtime is dominated by those boots, not by the assertions.
  // GitHub-hosted runners have 4 cores; measured on CI, 4 workers took the
  // memory suite from 100s to 61s over 2 workers, with no gain past that.
  // Note the ceiling is also load-bearing for the redis playground, which maps
  // JEST_WORKER_ID onto redis logical databases (16 available).
  maxWorkers: process.env.CI ? 4 : '50%',
  "transform": {
    "^.+\\.[tj]s$": ["ts-jest", {
      "tsconfig": {
        "allowJs": true
      }
    }]
  },
  // quick-lru v7 is ESM-only and must be transformed. The pattern has to
  // account for pnpm's layout, where the real path is
  // node_modules/.pnpm/quick-lru@7.0.1/node_modules/quick-lru rather than
  // node_modules/quick-lru.
  "transformIgnorePatterns": [
    "node_modules/(?!(\\.pnpm/)?quick-lru)"
  ],
});
