---
title: Redis provider
---

# Redis provider

## Installation

```bash
yarn add \
  @strapi-community/plugin-rest-cache \
  @strapi-community/plugin-redis \
  @strapi-community/provider-rest-cache-redis
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
          // The name of the connection as defined in the Redis plugin.
          connection: "default",
          // The time to live in milliseconds. This is the maximum amount of time that an item can be in the cache before it is removed.
          ttl: 3600 * 1000
          // ...
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
Ensure `redis` plugin configuration come before `rest-cache`
:::

::: tip
Additionally you can add options specifically for this provider. For all the options see [`@keyv/redis`](https://github.com/jaredwray/keyv/tree/5f58cad5fb364f80264fe1f38ee3224db21549af/packages/redis#options) documentation.
:::
