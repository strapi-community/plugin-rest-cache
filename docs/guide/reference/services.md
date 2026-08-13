---
title: Services reference
---

# {{ $frontmatter.title }}

Two services are exposed. Reach them with:

```js
const cacheStore = strapi.plugin("rest-cache").service("cacheStore");
const cacheConfig = strapi.plugin("rest-cache").service("cacheConfig");
```

For task-oriented examples, see [Purging](../invalidation/purging.md).

## cacheStore

Reads and writes the cache. Every method is a no-op returning `null` if the
provider is not initialised or not ready, and provider errors are logged rather
than thrown — a cache failure must not take the request down with it.

| Method | Returns | Description |
| --- | --- | --- |
| `get(key)` | `Promise<unknown>` | Read one entry. Times out after `provider.getTimeout` (default 500 ms) and resolves `null`, so a slow store degrades to a miss. |
| `set(key, value, maxAge?)` | `Promise<unknown>` | Store an entry. `maxAge` is **milliseconds**, default `3600000`. |
| `del(key)` | `Promise<unknown>` | Delete one entry. |
| `delMany(keys)` | `Promise<unknown>` | Delete many. Providers with batch operations override this; the default is bounded-concurrency single deletes. |
| `keys()` | `Promise<string[] \| null>` | Every key held, with `keysPrefix` stripped. |
| `reset()` | `Promise<unknown>` | Empty the cache. With a `keysPrefix` set, removes only this cache's keys, so a shared keyspace is left intact. |
| `clearByUid(uid, params?, wildcard?)` | `Promise<void>` | Purge a content type. See below. |
| `clearByRegexp(regExps)` | `Promise<void>` | Purge every key matching any of the given patterns. |
| `ready` | `boolean` | Whether the provider is usable. |

### clearByUid

The method you almost always want.

```js
// Every cached response for this content type, and — when
// `clearRelatedCache` is on — for the content types related to it.
await cacheStore.clearByUid("api::article.article", {}, true);

// Only the entries whose route params match.
await cacheStore.clearByUid("api::article.article", { id: 42 });
```

| Parameter | Type | Description |
| --- | --- | --- |
| `uid` | `string` | The content type uid. Throws if it is not configured for caching. |
| `params` | `object` | Route parameters used to narrow the purge, e.g. `{ id: 42 }`. |
| `wildcard` | `boolean` | Ignore `params` and clear every entry for the content type. |

## cacheConfig

Read-only access to the resolved strategy. "Resolved" matters: this is the
configuration after defaults were applied and routes were matched against what
Strapi actually registered, which is not always what was written.

| Method | Returns | Description |
| --- | --- | --- |
| `getUids()` | `string[]` | Every cached content type uid. |
| `get(uid)` | `object \| undefined` | The resolved config for one content type. |
| `isCached(uid)` | `boolean` | Whether a content type is configured for caching. |
| `getCacheKeysRegexp(uid, params, wildcard?)` | `RegExp[]` | The patterns matching that content type's keys. |
| `getRelatedCachedUid(uid)` | `string[]` | Related content types that are themselves cached. |
| `clearCache(uid, params?, wildcard?)` | `Promise<void>` | **Deprecated.** Use `cacheStore.clearByUid`. Logs a warning. |

## Example: purge on a lifecycle

```js
// ./src/api/article/content-types/article/lifecycles.js
module.exports = {
  async afterUpdate(event) {
    await strapi
      .plugin("rest-cache")
      .service("cacheStore")
      .clearByUid("api::article.article", {}, true);
  },
};
```

::: tip You probably do not need this
Writes through the document service already invalidate automatically, and that
covers lifecycles triggered by ordinary content changes. Reach for a manual
purge when something changed that Strapi cannot observe — a direct database
write, or an external system your responses depend on.
:::
