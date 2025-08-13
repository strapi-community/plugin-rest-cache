"use strict";

module.exports = async () => ({
  preset: 'ts-jest',
  verbose: true,
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
