---
title: Custom provider
---

# {{ $frontmatter.title }}

If neither [memory](./memory.md) nor [redis](./redis.md) fits — you already run Memcached, you want a two-tier cache, you want to push responses into a CDN's KV store — you can implement the provider contract yourself.

A provider is a small npm package that exports a factory and returns an object extending the plugin's `CacheProvider` class.

::: warning
The plugin currently resolves a provider by turning `provider.name` into the package `@strapi-community/provider-rest-cache-<name>`. If that cannot be resolved it falls back to requiring the name verbatim, but that fallback resolves relative to the plugin's own module rather than your project root, and it is not a supported extension point yet — the resolver carries a `@TODO` about loading providers published under an arbitrary npm name.

Until that lands, the reliable way to use a custom provider is to make it resolvable under that naming scheme, for example by publishing it as `@strapi-community/provider-rest-cache-mystore` or by linking a local package into `node_modules` under that name.
:::

## The contract

`CacheProvider` is exported from the plugin's `types` entry point:

```js
const { CacheProvider } = require("@strapi-community/plugin-rest-cache/types");
```

Your class must extend it. The plugin verifies this at bootstrap by walking the constructor chain by name rather than with a real `instanceof`, because your package resolves its own copy of the types bundle and a strict identity check would reject a perfectly correct provider. If nothing in the chain is named `CacheProvider`, bootstrap fails.

### Required members

| Member | Signature | Notes |
| --- | --- | --- |
| `get` | `async get(key: string): Promise<unknown>` | Return the stored value, or a nullish value on a miss. Subject to [`getTimeout`](./index.md#gettimeout). |
| `set` | `async set(key: string, val: unknown, maxAge?: number): Promise<unknown>` | `maxAge` is in **milliseconds**. |
| `del` | `async del(key: string \| string[]): Promise<unknown>` | Remove one key. |
| `keys` | `async keys(keysPrefix?: string): Promise<string[]>` | Every key you hold. |
| `ready` | `get ready(): boolean` | Whether the store can be used right now. |

::: warning
`maxAge` arrives already in milliseconds. Do not multiply it by 1000 to "convert from seconds" — that is exactly the bug that made every entry outlive its configured lifetime by a factor of 1000, so a one-hour cache actually held entries for 41.7 days ([#126](https://github.com/strapi-community/plugin-rest-cache/issues/126)).
:::

About `keys()`: return the keys **without** any adapter-internal qualification your backing store adds. The `keysPrefix` argument is the plugin's configured prefix, passed so a provider that can narrow its enumeration server-side may do so. Neither shipped provider uses it — the plugin filters and strips the prefix itself afterwards, so returning a superset is safe and returning a stripped subset is not.

About `ready`: the plugin checks it before every operation. When it is `false` the operation is skipped and logged, and requests are served uncached. Report the real health of your connection here rather than hardcoding `true`, unless your store genuinely cannot be unavailable (the memory provider returns a constant `true` for this reason).

About values: the plugin serializes the response before calling `set` and deserializes what `get` returns. Treat the value as opaque and store it as given.

### Optional members

`delMany(keys)` and `clear()` have working default implementations on the base class, so a provider written against the older contract keeps working unchanged.

| Member | Default behaviour |
| --- | --- |
| `delMany(keys: string[])` | Calls `del()` once per key, 16 at a time. |
| `clear()` | `delMany(await this.keys())`. |

Override them if your backing store has batch operations. The default is one round trip per key, which on a purge of a large cache is the difference between one command and tens of thousands.

## Writing the provider

```js
// file: ./lib/MyCacheProvider.js

const { CacheProvider } = require("@strapi-community/plugin-rest-cache/types");

class MyCacheProvider extends CacheProvider {
  constructor(client) {
    super();
    this.client = client;
  }

  async get(key) {
    return this.client.get(key);
  }

  /**
   * @param {string} key
   * @param {any} val
   * @param {number=} maxAge in MILLISECONDS
   */
  async set(key, val, maxAge = 3600000) {
    // Pass maxAge through in milliseconds. If your client expects seconds,
    // divide here - and only here.
    return this.client.set(key, val, { ttlMs: maxAge });
  }

  async del(key) {
    return this.client.delete(key);
  }

  /**
   * Every key held by this provider, unqualified.
   */
  async keys() {
    return this.client.listKeys();
  }

  /**
   * Optional: only worth overriding because this store can delete in batches.
   * Without it the base class deletes one key at a time.
   */
  async delMany(keys) {
    if (!keys.length) return;
    await this.client.deleteMany(keys);
  }

  /**
   * Optional: the store can drop everything in one call.
   */
  async clear() {
    await this.client.flush();
  }

  get ready() {
    return this.client.status === "ready";
  }
}

module.exports = {
  MyCacheProvider,
};
```

## Exporting the package

The package entry point exports `provider`, `name` and an `init` function. `init` receives your `provider.options` from `config/plugins` and the Strapi instance, and returns the provider instance. It may be async, which is where connection setup belongs — throwing here fails the boot, which is what you want if the cache cannot be reached.

```js
// file: ./lib/index.js

const { MyCacheProvider } = require("./MyCacheProvider");
const mystore = require("mystore-client");

module.exports = {
  provider: "mystore",
  name: "My Store",

  async init(options, { strapi }) {
    const client = await mystore.connect(options);

    // Fail loudly rather than booting into a cache that will never answer.
    if (!client) {
      throw new Error(
        'Could not initialize REST Cache provider "mystore": no connection.'
      );
    }

    return new MyCacheProvider(client);
  },
};
```

::: tip
`init` is also where you should read anything you need off `strapi` — an existing connection registered by another plugin, for example, which is how the [redis provider](./redis.md) borrows its client from `@strapi-community/plugin-redis` instead of opening its own.
:::

## Using it

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

module.exports = ({ env }) => ({
  "rest-cache": {
    config: {
      provider: {
        // Resolves @strapi-community/provider-rest-cache-mystore
        name: "mystore",
        getTimeout: 500,
        // Passed verbatim to your init(options, { strapi })
        options: {
          endpoint: env("MYSTORE_URL"),
        },
      },
      strategy: {
        contentTypes: ["api::article.article"],
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
        // Resolves @strapi-community/provider-rest-cache-mystore
        name: "mystore",
        getTimeout: 500,
        // Passed verbatim to your init(options, { strapi })
        options: {
          endpoint: env("MYSTORE_URL"),
        },
      },
      strategy: {
        contentTypes: ["api::article.article"],
      },
    },
  },
});
```

::::

On a successful boot Strapi logs which provider it loaded:

```
Using REST Cache plugin with provider "mystore"
```

## Reference implementations

The two shipped providers are small and are the best worked examples:

- `packages/provider-rest-cache-memory/src/MemoryCacheProvider.ts` — the minimal case, plus an async factory because `quick-lru` is ESM-only
- `packages/provider-rest-cache-redis/src/RedisCacheProvider.ts` — batch deletes, cluster handling, and cheap key enumeration

## Related

- [Choosing a provider](./index.md)
- [Configuration reference](../reference/config.md)
