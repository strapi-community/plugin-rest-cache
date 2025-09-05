---
title: Redis provider
---

# Redis provider

## Installation

```bash
yarn add \
  strapi-plugin-rest-cache \
  strapi-plugin-redis \
  strapi-provider-rest-cache-redis
```

## Configuration

```js
module.exports = {
  // Step 1: Configure the redis connection
  // @see https://github.com/strapi-community/strapi-plugin-redis
  redis: {
    // ...
  },
  // Step 2: Configure the redis cache plugin
  "rest-cache": {
    config: {
      provider: {
        name: "redis",
        options: {
          max: 32767,
          connection: "default",
        },
      },
      strategy: {
        // if you are using keyPrefix for your Redis, please add <keysPrefix>
        keysPrefix: "<redis_keyPrefix>",
        contentTypes: [
          // list of Content-Types UID to cache
          "api::category.category",
          "api::article.article",
          "api::global.global",
          "api::homepage.homepage",
        ],
      },
    },
  },
};
```

::: warning
Ensure `redis` plugin configuration come before `strapi-plugin-rest-cache`
:::
