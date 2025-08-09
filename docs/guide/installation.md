---
title: Installation
---

# {{ $frontmatter.title }}

1. Add required dependencies

   :::: code-group

   ```bash [memory (default)]
   yarn add @strapi-community/plugin-rest-cache
   ```

   ```bash [redis]
   yarn add \
     @strapi-community/plugin-rest-cache \
     @strapi-community/plugin-redis \
     @strapi-community/provider-rest-cache-redis
   ```

   ::::

   ::: info
   This plugin is only compatible with Strapi v4.0.0 and above.  
   If you are looking for a plugin for Strapi v3.x, please check the [strapi-middleware-cache](https://github.com/patrixr/strapi-middleware-cache/).
   :::

1. Enable the plugin in `./config/plugins.js`

   :::: code-group

   ```js [memory (default)]
   module.exports = {
     "rest-cache": {
       config: {
         provider: {
           name: "memory",
           options: {
             max: 32767,
             maxAge: 3600,
           },
         },
         strategy: {
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

   ```js [redis]
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

   ::::
