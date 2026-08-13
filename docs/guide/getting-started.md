---
title: Getting started
---

# {{ $frontmatter.title }}

## Requirements

- Strapi **>= 5.0.0**
- Node **>= 20**

::: info Older Strapi
For Strapi v4, see the [legacy documentation](/4.x.x/). For Strapi v3, see
[strapi-middleware-cache](https://github.com/patrixr/strapi-middleware-cache/).
:::

## Install

The plugin ships with an in-memory provider, which needs no other packages and
is the right choice for a single instance.

:::: code-group

```bash [npm]
npm install @strapi-community/plugin-rest-cache
```

```bash [yarn]
yarn add @strapi-community/plugin-rest-cache
```

```bash [pnpm]
pnpm add @strapi-community/plugin-rest-cache
```

::::

Running more than one instance? You want Redis, so that all of them share one
cache and one purge clears it everywhere. See
[the Redis provider](./providers/redis.md).

:::: code-group

```bash [npm]
npm install @strapi-community/plugin-rest-cache \
  @strapi-community/plugin-redis \
  @strapi-community/provider-rest-cache-redis
```

```bash [yarn]
yarn add @strapi-community/plugin-rest-cache \
  @strapi-community/plugin-redis \
  @strapi-community/provider-rest-cache-redis
```

```bash [pnpm]
pnpm add @strapi-community/plugin-rest-cache \
  @strapi-community/plugin-redis \
  @strapi-community/provider-rest-cache-redis
```

::::

## Configure

The smallest useful configuration names the content types to cache. Everything
else has a default.

:::: code-group

```js [JavaScript]
// ./config/plugins.js
module.exports = {
  "rest-cache": {
    config: {
      provider: {
        name: "memory",
        options: {
          maxSize: 32767,
          // Milliseconds. One hour.
          ttl: 3600000,
        },
      },
      strategy: {
        contentTypes: ["api::article.article", "api::category.category"],
      },
    },
  },
};
```

```ts [TypeScript]
// ./config/plugins.ts
export default {
  "rest-cache": {
    config: {
      provider: {
        name: "memory",
        options: {
          maxSize: 32767,
          // Milliseconds. One hour.
          ttl: 3600000,
        },
      },
      strategy: {
        contentTypes: ["api::article.article", "api::category.category"],
      },
    },
  },
};
```

::::

That caches each content type's default `GET` routes for an hour, and clears
them whenever the content changes.

## Check that it works

Turn on the `X-Cache` header, which is off by default:

:::: code-group

```js [JavaScript]
// ./config/plugins.js
module.exports = {
  "rest-cache": {
    config: {
      strategy: {
        enableXCacheHeaders: true,
        contentTypes: ["api::article.article"],
      },
    },
  },
};
```

```ts [TypeScript]
// ./config/plugins.ts
export default {
  "rest-cache": {
    config: {
      strategy: {
        enableXCacheHeaders: true,
        contentTypes: ["api::article.article"],
      },
    },
  },
};
```

::::

Then request the same route twice:

```bash
curl -sI http://localhost:1337/api/articles | grep -i x-cache
# X-Cache: MISS

curl -sI http://localhost:1337/api/articles | grep -i x-cache
# X-Cache: HIT
```

Now change an article in the admin panel and request it again. It should be a
`MISS` — the write invalidated the entry.

If the second request is also a `MISS`, see
[Troubleshooting](./troubleshooting.md).

::: warning HITPASS is not a failure
`X-Cache: HITPASS` means the request deliberately bypassed the cache. The
default `hitpass` does that for any request carrying an `authorization` or
`cookie` header — including every request your browser makes while logged into
the admin panel. Test with `curl`, or see
[caching authenticated requests](./caching/keys.md#useauth).
:::

## Next

- [How caching works](./caching/index.md)
- [How invalidation works](./invalidation/index.md)
- [Choosing a provider](./providers/index.md)
- [The admin panel](./admin/index.md)
- [Configuration reference](./reference/config.md)
