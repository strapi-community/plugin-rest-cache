<div align="center">
<h1>REST Cache — Redis Provider</h1>

<p style="margin-top: 0;">Redis, KeyDB and Valkey storage for <code>@strapi-community/plugin-rest-cache</code>.</p>

<p>
  <a href="https://www.npmjs.org/package/@strapi-community/provider-rest-cache-redis">
    <img src="https://img.shields.io/npm/v/@strapi-community/provider-rest-cache-redis/latest.svg" alt="NPM Version" />
  </a>
  <a href="https://www.npmjs.org/package/@strapi-community/provider-rest-cache-redis">
    <img src="https://img.shields.io/npm/dm/@strapi-community/provider-rest-cache-redis" alt="Monthly downloads on NPM" />
  </a>
</p>
</div>

Stores cache entries in Redis, so every Strapi instance shares one cache and a
purge on any of them clears it everywhere.

Use this as soon as you run more than one instance, or whenever the cache
should survive a restart.

KeyDB and Valkey speak the same protocol and work with this provider unchanged.

## Install

Three packages: the plugin, this provider, and the Redis connection plugin that
owns the client.

```bash
npm install @strapi-community/plugin-rest-cache @strapi-community/plugin-redis @strapi-community/provider-rest-cache-redis
```

```bash
yarn add @strapi-community/plugin-rest-cache @strapi-community/plugin-redis @strapi-community/provider-rest-cache-redis
```

```bash
pnpm add @strapi-community/plugin-rest-cache @strapi-community/plugin-redis @strapi-community/provider-rest-cache-redis
```

## Configure

```js
// ./config/plugins.js
module.exports = ({ env }) => ({
  // The connection is owned by @strapi-community/plugin-redis.
  redis: {
    config: {
      connections: {
        default: {
          connection: {
            host: env("REDIS_HOST", "127.0.0.1"),
            port: env.int("REDIS_PORT", 6379),
            db: 0,
          },
        },
      },
    },
  },

  "rest-cache": {
    config: {
      provider: {
        name: "redis",
        options: {
          // Names a connection defined above.
          connection: "default",
        },
      },
      strategy: {
        // Must match your Redis client's keyPrefix, if it sets one.
        keysPrefix: "",
        contentTypes: ["api::article.article"],
      },
    },
  },
});
```

```ts
// ./config/plugins.ts
export default ({ env }) => ({
  redis: {
    config: {
      connections: {
        default: {
          connection: {
            host: env("REDIS_HOST", "127.0.0.1"),
            port: env.int("REDIS_PORT", 6379),
            db: 0,
          },
        },
      },
    },
  },

  "rest-cache": {
    config: {
      provider: {
        name: "redis",
        options: {
          connection: "default",
        },
      },
      strategy: {
        keysPrefix: "",
        contentTypes: ["api::article.article"],
      },
    },
  },
});
```

### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `connection` | `string` | `"default"` | Which connection from `@strapi-community/plugin-redis` to use. |
| `ttl` | `number` (ms) | — | Store-level default lifetime. The plugin passes an explicit lifetime on every write from `strategy.maxAge`, so this is only a backstop. |

Any other option is passed through to [`@keyv/redis`](https://github.com/jaredwray/keyv/tree/main/packages/redis).

> **If your Redis client sets a `keyPrefix`, set `strategy.keysPrefix` to match.**
> A mismatch means the plugin enumerates none of its own keys, so every purge
> silently does nothing.

## Redis Cluster

Supported. Deletes are issued key by key when clustered, because a multi-key
`UNLINK` spanning hash slots is rejected outright:

```
CROSSSLOT Keys in request don't hash to the same slot
```

Key enumeration reads the adapter's own tracking set — a single `SMEMBERS` —
rather than scanning the keyspace. On a 100k-entry cache the scanning approach
measured roughly 20,000 round trips and 55MB transferred.

## KeyDB and Valkey

Both are Redis-protocol compatible; point the connection at them and change
nothing else.

```js
connection: {
  host: env("KEYDB_HOST", "127.0.0.1"),
  port: env.int("KEYDB_PORT", 6379),
}
```

## Documentation

- [Redis, KeyDB & Valkey](https://strapi-community.github.io/plugin-rest-cache/guide/providers/redis.html)
- [Several instances sharing one cache](https://strapi-community.github.io/plugin-rest-cache/guide/recipes/multi-instance.html)
- [Configuration reference](https://strapi-community.github.io/plugin-rest-cache/guide/reference/config.html)

## License

See the [LICENSE](https://github.com/strapi-community/plugin-rest-cache/blob/main/LICENSE) file.
