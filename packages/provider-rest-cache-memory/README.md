<div align="center">
<h1>REST Cache — Memory Provider</h1>

<p style="margin-top: 0;">In-process cache storage for <code>@strapi-community/plugin-rest-cache</code>.</p>

<p>
  <a href="https://www.npmjs.org/package/@strapi-community/provider-rest-cache-memory">
    <img src="https://img.shields.io/npm/v/@strapi-community/provider-rest-cache-memory/latest.svg" alt="NPM Version" />
  </a>
  <a href="https://www.npmjs.org/package/@strapi-community/provider-rest-cache-memory">
    <img src="https://img.shields.io/npm/dm/@strapi-community/provider-rest-cache-memory" alt="Monthly downloads on NPM" />
  </a>
</p>
</div>

Stores cache entries in the Strapi process, in an LRU bounded by entry count.
This is the default provider and ships with the plugin, so you rarely need to
install it yourself.

## When to use it

Use it when you run **one** Strapi instance.

Each process holds its own cache, so with two or more instances behind a load
balancer they cache independently and a purge on one does not reach the others
— one instance serves fresh content while another serves stale. Entries are
also lost on restart. If either matters, use
[`@strapi-community/provider-rest-cache-redis`](https://www.npmjs.com/package/@strapi-community/provider-rest-cache-redis).

## Install

Already a dependency of the plugin. Install it explicitly only if you want to
pin its version:

```bash
npm install @strapi-community/provider-rest-cache-memory
```

```bash
yarn add @strapi-community/provider-rest-cache-memory
```

```bash
pnpm add @strapi-community/provider-rest-cache-memory
```

## Configure

```js
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
        contentTypes: ["api::article.article"],
      },
    },
  },
};
```

```ts
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
        contentTypes: ["api::article.article"],
      },
    },
  },
};
```

### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `maxSize` | `number` | `32767` | Maximum number of entries before the least recently used one is evicted. Must be greater than 0. |
| `ttl` | `number` (ms) | — | Store-level default lifetime. In practice the plugin passes an explicit lifetime on every write from `strategy.maxAge`, so this is only a backstop. |

`max` is accepted as a legacy alias for `maxSize`.

> **Durations are milliseconds.** `3600000` is one hour; `3600` is 3.6 seconds.
> Set the lifetime you actually care about with `strategy.maxAge`.

## Documentation

- [Memory provider](https://strapi-community.github.io/plugin-rest-cache/guide/providers/memory.html)
- [Choosing a provider](https://strapi-community.github.io/plugin-rest-cache/guide/providers/)
- [Configuration reference](https://strapi-community.github.io/plugin-rest-cache/guide/reference/config.html)

## License

See the [LICENSE](https://github.com/strapi-community/plugin-rest-cache/blob/main/LICENSE) file.
