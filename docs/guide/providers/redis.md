---
title: Redis provider
---

# {{ $frontmatter.title }}

The redis provider stores cached responses in Redis. Use it when the cache has to outlive the Strapi process, or when more than one Strapi instance has to share and invalidate the same cache.

It does not open its own connection. It borrows one from [`@strapi-community/plugin-redis`](https://github.com/strapi-community/plugin-redis), which owns connection configuration, pooling and cluster setup. That plugin is a required dependency.

## Installation

:::: code-group

```bash [npm]
npm install @strapi-community/plugin-rest-cache @strapi-community/plugin-redis @strapi-community/provider-rest-cache-redis
```

```bash [yarn]
yarn add @strapi-community/plugin-rest-cache @strapi-community/plugin-redis @strapi-community/provider-rest-cache-redis
```

```bash [pnpm]
pnpm add @strapi-community/plugin-rest-cache @strapi-community/plugin-redis @strapi-community/provider-rest-cache-redis
```

::::

## Configuration

Configure the connection with the redis plugin, then point the cache provider at it by name.

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

module.exports = ({ env }) => ({
  // Step 1: define the connection
  // @see https://github.com/strapi-community/plugin-redis
  redis: {
    config: {
      connections: {
        default: {
          connection: {
            host: env("REDIS_HOST", "127.0.0.1"),
            port: env.int("REDIS_PORT", 6379),
            db: 0,
          },
          settings: {
            debug: false,
            cluster: false,
          },
        },
      },
    },
  },

  // Step 2: tell the cache to use it
  "rest-cache": {
    config: {
      provider: {
        name: "redis",
        getTimeout: 500,
        options: {
          // Name of a connection defined above.
          connection: "default",
          // Default lifetime of an entry, in MILLISECONDS. 1 hour.
          ttl: 3600000,
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
  // Step 1: define the connection
  // @see https://github.com/strapi-community/plugin-redis
  redis: {
    config: {
      connections: {
        default: {
          connection: {
            host: env("REDIS_HOST", "127.0.0.1"),
            port: env.int("REDIS_PORT", 6379),
            db: 0,
          },
          settings: {
            debug: false,
            cluster: false,
          },
        },
      },
    },
  },

  // Step 2: tell the cache to use it
  "rest-cache": {
    config: {
      provider: {
        name: "redis",
        getTimeout: 500,
        options: {
          // Name of a connection defined above.
          connection: "default",
          // Default lifetime of an entry, in MILLISECONDS. 1 hour.
          ttl: 3600000,
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

::: info
The order in which you declare `redis` and `rest-cache` in `plugins.js` does not matter. The provider is created during the plugin's bootstrap phase, by which point every plugin's configuration has been registered.
:::

## `options` reference

### `connection`

The name of a connection declared under `redis.config.connections`. The provider looks the connection up on `strapi.redis` and waits for the client to report `ready` before the plugin finishes booting, so a cache misconfiguration surfaces as a startup error rather than as silent cache misses at runtime.

If the named connection does not exist, or the redis plugin is not installed, bootstrap fails with an explicit message.

- **Type:** `string`
- **Default:** `'default'`

### `ttl`

Default lifetime of a cache entry, in **milliseconds**.

- **Type:** `number` (milliseconds)
- **Default:** none

::: info
The plugin passes an explicit lifetime on every write, taken from `strategy.maxAge` or the per-content-type `maxAge`, so `ttl` is a store-level fallback that those override. Set the lifetime you care about in [the strategy](../reference/config.md#strategy).
:::

### Other options

Anything else in `options` is forwarded to [`@keyv/redis`](https://github.com/jaredwray/keyv/tree/main/packages/redis#options) untouched — `namespace`, `useRedisSets`, and so on.

::: warning
Leave `useRedisSets` enabled. The provider relies on the key-tracking set that `@keyv/redis` maintains, both to enumerate keys efficiently and to purge correctly on a cluster. With it disabled the provider falls back to `SCAN`, which is far slower and, on a cluster, incomplete — see below.
:::

## Key prefixes

If your Redis client is configured with a `keyPrefix`, set `strategy.keysPrefix` to the same value so the plugin's own key handling lines up with what is actually stored:

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

"rest-cache": {
  config: {
    provider: { name: "redis", options: { connection: "default" } },
    strategy: {
      keysPrefix: "<redis_keyPrefix>",
      contentTypes: ["api::article.article"],
    },
  },
},
```

```ts [TypeScript]
// file: ./config/plugins.ts

"rest-cache": {
  config: {
    provider: { name: "redis", options: { connection: "default" } },
    strategy: {
      keysPrefix: "<redis_keyPrefix>",
      contentTypes: ["api::article.article"],
    },
  },
},
```

::::

A prefix also means the keyspace is shared with something else, so the plugin will not flush the database wholesale on reset. It enumerates its own keys, filters them by prefix, and deletes only those.

## Enumerating keys

Purging by content type means finding every cache key that matches a pattern, which means listing keys.

The provider reads `@keyv/redis`'s own tracking set — a single `SMEMBERS` — rather than scanning the keyspace. The previous implementation iterated the store, which issued a `SCAN` at ioredis' default `COUNT` of 10 and an `MGET` of a page of **values** for every page, purely to learn key names. Measured over a 100,000-entry cache that was roughly 20,000 round trips and 55MB transferred, against one round trip now ([#131](https://github.com/strapi-community/plugin-rest-cache/issues/131)).

If you sized `getTimeout` or your Redis timeouts around the old behaviour, you can bring them back down.

## Redis Cluster

Cluster is supported. Set `cluster: true` in the connection's `settings` (see the [redis plugin](https://github.com/strapi-community/plugin-redis) for the full cluster configuration) and the cache provider adapts on its own.

Two things differ when clustered, and both are handled for you:

- **Deletes are issued one key at a time.** A multi-key `UNLINK` — or a `MULTI` spanning several keys — is rejected outright when the keys live in different hash slots:

  ```
  CROSSSLOT Keys in request don't hash to the same slot
  ```

  Cache keys are derived from request paths and therefore spread across slots, so the provider deletes them individually with bounded concurrency and lets the cluster client route each one. The tracking set is a single key, so removing entries from it stays batched ([#100](https://github.com/strapi-community/plugin-rest-cache/issues/100)).

- **Key listing does not use `SCAN`.** `SCAN` addresses one node, so on a cluster it returns only the portion of the keyspace that node holds — a purge built on it silently misses everything on the other nodes. Reading the tracking set avoids that entirely, because the set is one key and therefore complete.

::: warning
This is the concrete reason not to disable `useRedisSets` on a cluster: doing so drops the provider onto the `SCAN` fallback, and purges will quietly under-delete.
:::

## KeyDB

[KeyDB](https://docs.keydb.dev/) is protocol-compatible with Redis. Use the same provider and the same configuration; only the host and port change.

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

redis: {
  config: {
    connections: {
      default: {
        connection: {
          host: env("KEYDB_HOST", "127.0.0.1"),
          port: env.int("KEYDB_PORT", 6379),
        },
      },
    },
  },
},
```

```ts [TypeScript]
// file: ./config/plugins.ts

redis: {
  config: {
    connections: {
      default: {
        connection: {
          host: env("KEYDB_HOST", "127.0.0.1"),
          port: env.int("KEYDB_PORT", 6379),
        },
      },
    },
  },
},
```

::::

## Valkey

[Valkey](https://valkey.io/) is a fork of Redis and is likewise protocol-compatible. Same provider, same configuration.

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

redis: {
  config: {
    connections: {
      default: {
        connection: {
          host: env("VALKEY_HOST", "127.0.0.1"),
          port: env.int("VALKEY_PORT", 6379),
        },
      },
    },
  },
},
```

```ts [TypeScript]
// file: ./config/plugins.ts

redis: {
  config: {
    connections: {
      default: {
        connection: {
          host: env("VALKEY_HOST", "127.0.0.1"),
          port: env.int("VALKEY_PORT", 6379),
        },
      },
    },
  },
},
```

::::

::: tip
Connection options — TLS, sentinel, authentication, cluster nodes — belong to the redis plugin, not to this one. See [`@strapi-community/plugin-redis`](https://github.com/strapi-community/plugin-redis) for the full set.
:::

## Related

- [Choosing a provider](./index.md)
- [Memory provider](./memory.md)
- [Configuration reference](../reference/config.md)
