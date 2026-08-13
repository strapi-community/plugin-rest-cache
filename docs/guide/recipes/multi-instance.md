---
title: Several instances, one cache
---

# {{ $frontmatter.title }}

## When this applies

You run more than one Strapi process: two containers behind a load balancer, an
autoscaling group, a blue/green deployment, or separate read and write
deployments. The symptom that brings people here is always the same — an editor
publishes a change, refreshes, and sees the new content about half the time.
That is not a bug in invalidation. It is the memory provider doing exactly what
it says: each process has its own cache, and a purge on one does not reach the
other.

The fix is a shared store, which means Redis.

## Configuration

The redis provider does not open its own connection. It borrows one from
[`@strapi-community/plugin-redis`](https://github.com/strapi-community/plugin-redis),
which is a required dependency and owns all connection, TLS and cluster
configuration.

```bash
npm install @strapi-community/plugin-rest-cache \
  @strapi-community/plugin-redis \
  @strapi-community/provider-rest-cache-redis
```

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

module.exports = ({ env }) => ({
  // Step 1: the connection, owned by the redis plugin.
  redis: {
    config: {
      connections: {
        default: {
          connection: {
            host: env("REDIS_HOST", "127.0.0.1"),
            port: env.int("REDIS_PORT", 6379),
            db: 0,
            // If you set a keyPrefix here, it must match keysPrefix below.
            keyPrefix: env("REDIS_PREFIX", "strapi:"),
          },
          settings: {
            debug: false,
            cluster: false,
          },
        },
      },
    },
  },

  // Step 2: point the cache at it.
  "rest-cache": {
    config: {
      provider: {
        name: "redis",
        getTimeout: 500,
        options: {
          connection: "default",
          ttl: 3600000, // store-level backstop, in milliseconds
        },
      },
      strategy: {
        // Must be identical on every instance.
        maxAge: 3600000,
        keysPrefix: env("REDIS_PREFIX", "strapi:"),
        enableXCacheHeaders: true,

        // Leave this off. See below.
        resetOnStartup: false,

        keys: {
          useQueryParams: true,
          useHeaders: [],
        },

        contentTypes: [
          "api::article.article",
          "api::category.category",
        ],
      },
    },
  },
});
```

```ts [TypeScript]
// file: ./config/plugins.ts

export default ({ env }) => ({
  // Step 1: the connection, owned by the redis plugin.
  redis: {
    config: {
      connections: {
        default: {
          connection: {
            host: env("REDIS_HOST", "127.0.0.1"),
            port: env.int("REDIS_PORT", 6379),
            db: 0,
            // If you set a keyPrefix here, it must match keysPrefix below.
            keyPrefix: env("REDIS_PREFIX", "strapi:"),
          },
          settings: {
            debug: false,
            cluster: false,
          },
        },
      },
    },
  },

  // Step 2: point the cache at it.
  "rest-cache": {
    config: {
      provider: {
        name: "redis",
        getTimeout: 500,
        options: {
          connection: "default",
          ttl: 3600000, // store-level backstop, in milliseconds
        },
      },
      strategy: {
        // Must be identical on every instance.
        maxAge: 3600000,
        keysPrefix: env("REDIS_PREFIX", "strapi:"),
        enableXCacheHeaders: true,

        // Leave this off. See below.
        resetOnStartup: false,

        keys: {
          useQueryParams: true,
          useHeaders: [],
        },

        contentTypes: [
          "api::article.article",
          "api::category.category",
        ],
      },
    },
  },
});
```

::::

## Why these values

**Redis rather than memory.** This is not a performance preference, it is a
correctness requirement. The memory provider keeps entries in one Node heap.
Two instances therefore have two independent caches: instance A handles a write,
purges its own entries, and instance B carries on serving the pre-write response
until `maxAge` expires. Nothing can make the memory provider coherent across
processes — there is no cross-process channel for it to use. With Redis there is
one keyspace, so one purge is one purge.

**`keysPrefix` matching the client's `keyPrefix`.** If your Redis client
prefixes keys, the plugin's own key handling has to know that, or its purge
patterns are matched against strings that do not look like what is stored. Set
both from the same environment variable so they cannot drift.

A prefix is also what makes `reset()` safe on a shared Redis: with one
configured, a reset enumerates the plugin's own keys and deletes only those,
instead of flushing whatever else lives in that database.

**`resetOnStartup: false`.** On a single instance, emptying the cache at boot is
a reasonable way to handle deploys that change response shape. On several
instances sharing one Redis it is actively harmful: a rolling deploy restarts
instances one at a time, and each one wipes the cache the already-warm instances
are serving from. Purge once from your deploy pipeline instead — see the
[content API purge endpoint](../invalidation/purging.md#content-api).

**`getTimeout: 500`.** A cache read that does not come back within this is
abandoned and treated as a miss, so a sick Redis costs you a cache rather than a
site. The default is fine over a local network; raise it only if your Redis
genuinely sits far away and you would rather wait than re-query.

## Every instance must agree

The strategy is resolved per process, from that process's own configuration. The
store is shared, but the *interpretation* of it is not. If two instances
disagree, they will write entries the other cannot find or, worse, entries the
other reads under the wrong assumptions:

| Divergence | Result |
| --- | --- |
| Different `keysPrefix` | Two disjoint keyspaces in one Redis. Neither instance ever hits the other's entries, and neither purges them. All the cost of Redis, none of the sharing. |
| Different `keys` configuration | Instance A writes `/api/articles?locale=fr&&` while instance B looks up `/api/articles?&&`. Permanent misses, or a response served for the wrong query. |
| Different `contentTypes` lists | The instance that does not know about a content type never purges it, so writes routed there leave stale entries for everyone. |
| Different `maxAge` | Entry lifetime becomes a function of which instance happened to write it. Confusing rather than incorrect, but it makes staleness impossible to reason about. |

Ship one configuration file to every instance and drive the differences that
must vary — host, port, credentials — from environment variables, as above.

::: warning
This applies to instances you might not think of as instances: a worker
container running cron jobs, a separate admin-only deployment, a migration task.
If it boots Strapi with this plugin and a different config, it participates in
the same keyspace under different rules.
:::

## Check it works

The test is that a `MISS` on one instance becomes a `HIT` on another. Address
each instance directly, bypassing the load balancer:

```bash
curl -s -o /dev/null -D - http://instance-a:1337/api/articles | grep -i x-cache
# X-Cache: MISS

curl -s -o /dev/null -D - http://instance-b:1337/api/articles | grep -i x-cache
# X-Cache: HIT   <- instance B never called its own database
```

Then check that a purge propagates. Write through instance A, and read from
instance B:

```bash
# Edit an article via instance A's admin panel or REST API, then:
curl -s -o /dev/null -D - http://instance-b:1337/api/articles | grep -i x-cache
# X-Cache: MISS  <- instance A's purge cleared the entry B was serving
```

If the first test says `MISS` twice, the instances are not sharing a keyspace —
check `keysPrefix` and the Redis database number before anything else. You can
confirm what the plugin thinks it holds from either instance:

```js
await strapi.plugin("rest-cache").service("cacheStore").keys();
```

Keys come back with `keysPrefix` stripped, so both instances should return the
same list.

## Watch out for

**A cold Redis is a thundering herd.** The moment you point a fleet at an empty
shared cache, every instance misses everything at once. Request coalescing
bounds this *within* one process — N concurrent misses for one key make one
origin call — but it does not coordinate across instances, so the floor is one
origin call per key per instance. Warm the cache before shifting traffic if your
database cannot absorb that.
<Badge type="tip" text="since 5.1.0" />

**`reset()` without a `keysPrefix` clears the whole database.** If that Redis
holds sessions, queues or anything else, they go too. Set `keysPrefix` whenever
the store is not exclusively the plugin's.

**Do not disable `useRedisSets`.** The provider reads `@keyv/redis`'s key
tracking set to enumerate keys for purging. With it disabled it falls back to
`SCAN`, which is far slower and — on a cluster — incomplete, because `SCAN`
addresses one node. Purges then quietly under-delete, which looks exactly like
invalidation being broken.

**Bulk operations in the content manager still race the commit.** The purge is
awaited before the write returns, but content-manager bulk actions wrap their
loop in an outer transaction, so the purge can land before that commit. A read
arriving in that window repopulates from pre-commit state. This is not specific
to Redis, but it is more visible across instances because more readers are
racing. See [timing and failure](../invalidation/index.md#timing-and-failure).

## Related

- [Redis provider](../providers/redis.md) — cluster, KeyDB, Valkey, `options`
- [Memory provider](../providers/memory.md) — why it cannot do this
- [Invalidation](../invalidation/index.md#what-invalidation-cannot-see)
- [Purging manually](../invalidation/purging.md)
