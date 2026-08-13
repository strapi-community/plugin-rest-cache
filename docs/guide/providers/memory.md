---
title: Memory provider
---

# {{ $frontmatter.title }}

The memory provider keeps cached responses in the Strapi process itself, in a bounded LRU store. It is the default, and it is the right choice for a single-instance deployment.

It is backed by [`quick-lru`](https://github.com/sindresorhus/quick-lru), reached through `cache-manager` and `keyv`.

## Trade-offs

The cache lives in the Node heap of one process. That has two consequences worth being deliberate about:

- **It is discarded on restart.** Every deploy, every crash, every scale-to-zero starts from an empty cache. If a cold cache would knock over your database, use [redis](./redis.md).
- **It is not shared.** If you run two or more Strapi instances, each has its own cache and each invalidates only its own. A write handled by one instance leaves the other instances serving stale responses until they expire. There is no way to make the memory provider coherent across processes — this is what the redis provider is for.

In exchange there is no network hop and no serialization across a socket, so reads are as cheap as they get.

## Installation

The memory provider is installed as part of the plugin. Installing the plugin is enough:

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

## Configuration

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

module.exports = ({ env }) => ({
  "rest-cache": {
    config: {
      provider: {
        name: "memory",
        getTimeout: 500,
        options: {
          // Default lifetime of an entry, in MILLISECONDS. 1 hour.
          ttl: 3600000,
          // Maximum number of entries before the least recently used are evicted.
          maxSize: 32767,
        },
      },
      strategy: {
        contentTypes: [
          "api::category.category",
          "api::article.article",
        ],
      },
    },
  },
});
```

```ts [TypeScript]
// file: ./config/plugins.ts

export default ({ env }) => ({
  "rest-cache": {
    config: {
      provider: {
        name: "memory",
        getTimeout: 500,
        options: {
          // Default lifetime of an entry, in MILLISECONDS. 1 hour.
          ttl: 3600000,
          // Maximum number of entries before the least recently used are evicted.
          maxSize: 32767,
        },
      },
      strategy: {
        contentTypes: [
          "api::category.category",
          "api::article.article",
        ],
      },
    },
  },
});
```

::::

## `options` reference

### `ttl`

Default lifetime of a cache entry, in **milliseconds**.

- **Type:** `number` (milliseconds)
- **Default:** none (the store applies no default of its own)

::: info
In practice the plugin passes an explicit lifetime on every write, taken from `strategy.maxAge` or the per-content-type `maxAge`. `ttl` is the store-level fallback and is overridden by those on every entry the plugin stores. Set the lifetime you actually care about in [the strategy](../reference/config.md#strategy); set `ttl` here only if you want a backstop.
:::

### `maxSize`

The maximum number of entries held before `quick-lru` starts evicting the least recently used ones. This is a bound on **entry count**, not on bytes, so size the number against how large your cached responses typically are.

The bound is what keeps a cache of a high-cardinality endpoint (anything keyed on query params) from growing until the process runs out of heap.

- **Type:** `number` (entries)
- **Default:** `32767`

::: warning
`quick-lru` requires `maxSize` to be a number greater than 0 and throws on construction otherwise. Do not set it to `0` to mean "unbounded" — there is no unbounded mode.
:::

### `max`

Legacy alias for `maxSize`. If `max` is set it is renamed to `maxSize` before the store is constructed. Prefer `maxSize` in new configuration.

- **Type:** `number` (entries)

## Other options

Anything else in `options` is forwarded to `quick-lru` untouched. See the [`quick-lru` options](https://github.com/sindresorhus/quick-lru/tree/v7.0.1#options) for the full list.

## Related

- [Choosing a provider](./index.md)
- [Redis provider](./redis.md)
- [Configuration reference](../reference/config.md)
