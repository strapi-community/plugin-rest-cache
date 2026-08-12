"use strict";

module.exports = async () => ({
  preset: 'ts-jest',
  verbose: true,
  // Every test file boots its own Strapi instance, which is CPU and memory
  // heavy (roughly 300-500MB each). GitHub-hosted runners are small, so
  // over-subscribing there costs more in swap and contention than it saves.
  // Locally, use half the cores.
  maxWorkers: process.env.CI ? 2 : '50%',
  "transform": {
    "^.+\\.[tj]s$": ["ts-jest", {
      "tsconfig": {
        "allowJs": true
      }
    }]
  },
  "transformIgnorePatterns": [
    "node_modules/(?!quick-lru)"
  ],
});
