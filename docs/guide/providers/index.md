---
title: Cache providers
---

# {{ $frontmatter.title }}

A **provider** is the thing that actually holds cached responses. The plugin decides *what* to cache and *when* to throw it away; the provider decides *where* the bytes live.

Two providers ship with the plugin:

| Provider | Package | Survives a restart | Shared across instances |
| --- | --- | --- | --- |
| [`memory`](./memory.md) | `@strapi-community/provider-rest-cache-memory` | No | No |
| [`redis`](./redis.md) | `@strapi-community/provider-rest-cache-redis` | Yes | Yes |

You can also [write your own](./custom.md).

Only one provider is active at a time.

## Choosing a provider

Use **memory** when you run a single Strapi instance and a cold cache after a deploy is acceptable. It has no external dependency and no network hop, so reads are as fast as they can be.

Use **redis** when either of these is true:

- **You run more than one Strapi instance.** With the memory provider each instance keeps its own cache, so a write handled by instance A invalidates only A's copy. Instance B keeps serving the stale response until it expires on its own. This is the most common reason people move off memory.
- **You cannot afford a cold cache on restart.** Memory is discarded on every process exit, including every deploy and every crash-restart.

Redis also removes the cache from the Node heap, which matters if your responses are large and your container's memory limit is tight.

## Configuration

The provider is configured under `config.provider` in your plugin config:

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

module.exports = ({ env }) => ({
  "rest-cache": {
    config: {
      provider: {
        name: "memory",
        getTimeout: 500,
        options: {},
      },
      strategy: {
        // ...
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
        options: {},
      },
      strategy: {
        // ...
      },
    },
  },
});
```

::::

## `provider` reference

### `name`

Which provider to load. The plugin resolves this to the package `@strapi-community/provider-rest-cache-<name>`, so `"redis"` loads `@strapi-community/provider-rest-cache-redis`.

- **Type:** `string`
- **Default:** `'memory'`

::: info
If that package cannot be resolved, the plugin falls back to requiring the name verbatim. That fallback is not a supported extension point yet — the resolver carries a `@TODO` about supporting providers published under an arbitrary npm name, and a relative path resolves against the plugin's own module rather than your project root. Publish or link your provider under the `@strapi-community` naming scheme until that lands. See [Custom provider](./custom.md).
:::

### `getTimeout`

How long a single **cache read** may take before the plugin stops waiting, logs the timeout, and treats the request as a cache miss. The request then goes to Strapi as normal.

This exists so a slow or half-dead cache degrades into "no cache" rather than into "every request hangs". It is worth raising only if your Redis genuinely sits far away and you would rather wait than re-render; lower it if you would rather serve fresh than wait at all.

It applies to reads only. Writes and purges are not timed out.

- **Type:** `number` (milliseconds)
- **Default:** `500`

### `options`

Passed straight through to the provider's `init()`. Every provider defines its own shape — see [memory](./memory.md) and [redis](./redis.md).

- **Type:** `object`
- **Default:** `{}`

## A note on time units

::: warning
Every duration in this plugin — `provider.options.ttl`, `strategy.maxAge`, per-content-type `maxAge` — is in **milliseconds**.

One hour is `3600000`, not `3600`. A previous release multiplied the configured value by 1000 a second time, so a cache configured for one hour actually held entries for 41.7 days ([#126](https://github.com/strapi-community/plugin-rest-cache/issues/126)). If you compensated for that bug by dividing your configured values, undo it.
:::

## Related

- [Configuration reference](../reference/config.md) — every option, with defaults
- [Configuration reference](../reference/config.md)
- [Admin panel](../admin/index.md)
