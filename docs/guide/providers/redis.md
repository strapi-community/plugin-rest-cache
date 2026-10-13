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

On plugin-redis v2, anything else in `options` is forwarded to [`@keyv/redis`](https://github.com/jaredwray/keyv/tree/main/packages/redis#options) untouched — `namespace`, `useRedisSets`, and so on. On [plugin-redis v3](#plugin-redis-v3) the provider runs on its own store, which honours `useRedisSets` and ignores the rest.

::: warning
Leave `useRedisSets` enabled. The provider lists keys for every pattern purge, and with the key-tracking set that is a single `SMEMBERS`. With it disabled there is no set to read, so the provider finds its entries with `SCAN` instead — on every master of a cluster, so purges are still complete, but each listing walks the whole keyspace of every node, which is far slower on a large or shared database.
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

The provider reads `@keyv/redis`'s own tracking set — a single `SMEMBERS` — rather than scanning the keyspace. The previous implementation iterated the store, which issued a `SCAN` at ioredis' default `COUNT` of 10 and an `MGET` of a page of **values** for every page, purely to learn key names. Measured over a 100,000-entry cache that was roughly 20,000 round trips and 55MB transferred ([#131](https://github.com/strapi-community/plugin-rest-cache/issues/131)).

`SMEMBERS` is one command, but its reply holds every tracked key, so its cost still grows with the cache: listing 100,000 keys took 50–110ms in local measurements, on a standalone server and on a three-node cluster alike. Every pattern purge lists keys, so that is what a content save pays per purge. If you raised `getTimeout` or your Redis command timeouts to survive the old enumeration, size them for an `SMEMBERS` of your largest cache rather than removing the headroom altogether.

### Expired entries in the tracking set

`@keyv/redis` adds a key to that set when it writes the entry, but removes it only on an explicit delete. An entry that expires on its `maxAge` leaves its key behind, and the set itself never expires, so without help it grows for as long as the cache runs.

The provider prunes it in the background: it walks the set with `SSCAN`, 500 members at a time, checks each with `EXISTS` (one pipeline per batch on a standalone server, routed key by key on a cluster) and removes the members whose entries are gone. A pass starts at most once every five minutes per Strapi process, triggered by a write or a key listing, and neither ever waits for it. Over 100,000 members a pass took about 0.5–0.8s on a standalone server and 2.5–4.5s on a three-node cluster, holding Strapi's event loop for at most a few tens of milliseconds at a time.

A member is removed only once its entry is confirmed gone, and checked again afterwards in case a response was cached for that key in the meantime. A failed check counts as "still there", and if the re-check fails, everything that batch removed is put back. The one case left is a response cached in that window while putting members back fails twice in a row: that entry is then missed by purges until its `maxAge`, as with a failed delete on a cluster (below). A failing prune never surfaces as an error; the next pass picks up what it did not reach.

Because listing does not wait for the prune, keys can be listed for up to about five minutes, plus the length of a pass, after their entries expire on a cache that is in use. That has two visible effects:

- a purge may match a key that has already expired. It removes the key from the set and deletes nothing, which is harmless;
- the admin panel's cache statistics can count entries that expired since the last pass. On a cache that is being written to, that is at most about five minutes' worth of expiries; on one that has been idle, the first listing after the idle period can include everything that expired during it, and the counts settle once the pass it starts has finished.

## Redis Cluster

Cluster is supported. Set `cluster: true` in the connection's `settings` (see the [redis plugin](https://github.com/strapi-community/plugin-redis) for the full cluster configuration) and the cache provider adapts on its own.

Two things differ when clustered, and both are handled for you:

- **Deletes are issued one key at a time.** A multi-key `UNLINK` — or a `MULTI` spanning several keys — is rejected outright when the keys live in different hash slots:

  ```
  CROSSSLOT Keys in request don't hash to the same slot
  ```

  Cache keys are derived from request paths and therefore spread across slots, so the provider deletes them individually with bounded concurrency and lets the cluster client route each one. The tracking set is a single key, so removing entries from it stays batched ([#100](https://github.com/strapi-community/plugin-rest-cache/issues/100)).

  Without a `MULTI`, a purge and a response being cached for the same key can interleave, so the provider removes a key from the tracking set _before_ deleting the entry. The other way round, a write landing between the two left a live entry outside the set, which no purge could find until it expired. The trade-off is on the failure path: if Redis fails the delete after the entry has been untracked, the entry stays cached, out of reach of purges, until its `maxAge`.

- **Key listing reads the tracking set.** The set is one key, and therefore complete wherever it lives. `SCAN` addresses one node, so on a cluster it returns only the portion of the keyspace that node holds.

  With `useRedisSets` disabled there is no set, so the provider sends `SCAN` to every master and combines the results ([#245](https://github.com/strapi-community/plugin-rest-cache/pull/245)). Purges are complete either way; the tracking set is just much cheaper to read.

## plugin-redis v3

[`@strapi-community/plugin-redis`](https://github.com/strapi-community/plugin-redis) v3 moves from ioredis to node-redis. The provider supports v2 and v3 alike — its peer range is `^2.0.0 || ^3.0.0-0` — and needs no configuration change for either:

- **Detection.** The provider checks for v3's `connection` service at bootstrap, by what it can do rather than by version number. If it is there, the provider waits on `whenReady(connection)`, which rejects with the reason rather than hanging when the connection cannot be established. Otherwise it runs exactly as on v2.
- **Client.** On v3 the provider runs on the connection's node-redis client, `.native`. v3 also offers an ioredis-compatible `.client`, but that is deprecated and removed in v4, so the provider only keeps it on `provider.client` for code typed against it and never sends a command through it.
- **Client swap.** v3 replaces the node-redis client of a cluster or sentinel connection that has to reconnect from scratch. The provider reads `.native` for every command instead of keeping the client it started with, so it follows the swap.
- **Same data.** Entries are stored exactly as on v2 — the same key names, the same tracking set, lifetimes in milliseconds — so entries cached before an upgrade are still read and purged after it, and after a rollback. Cluster deletes, key listing without `useRedisSets` and the tracking-set prune behave as described above.
- **Shared connection.** The client belongs to the redis plugin and other plugins may use it. The provider never closes it.

Node.js 20 is not supported by plugin-redis v3. On Node 20, stay on plugin-redis v2: the provider keeps working on it as before.

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
