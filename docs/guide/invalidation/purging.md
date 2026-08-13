---
title: Purging manually
---

# {{ $frontmatter.title }}

[Invalidation](./index.md) is automatic and covers every write that goes
through Strapi. Manual purging is for what it cannot see: content changed
directly in the database, a restore from backup, an upstream system that
changed something your responses embed, or a deploy that changes how responses
are rendered without changing any content.

There are four ways in, and they all end up in the same place —
`cacheStore.clearByUid`.

## From the admin panel

::: tip Since 5.1.0
The dashboard and the content-manager purge controls were added in 5.1.0.
:::

| Where | Scope |
| --- | --- |
| **Settings → REST Cache**, the **Purge** button on a content type row | Every entry for that content type |
| Content manager, edit view, **More actions → Purge REST Cache** | The entry you have open |
| Content manager, list view, the purge control in the action bar | Every entry for that content type |

Purging requires the `plugin::rest-cache.cache.purge` permission, granted under
**Settings → Roles**. The controls only appear for content types that are in
your configuration, so their presence tells you caching applies at all.

See [Admin panel](../admin/index.md) for the rest of the dashboard.

## Admin API

```http
POST /rest-cache/purge
```

Plugin admin routes mount at `/<pluginName>` with no `/admin` prefix, so the
path is `/rest-cache/purge`. It requires an authenticated admin user holding
`plugin::rest-cache.cache.purge`.

```json
{
  "contentType": "api::article.article",
  "params": { "id": "lxr8ai1cs0a1234" },
  "wildcard": false
}
```

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `contentType` | `string` | yes | The uid to purge. Must be a content type you configured. |
| `params` | `object` | no | Route parameters to substitute, e.g. `{ id }`. Omit to purge the routes that take no parameters. |
| `wildcard` | `boolean` | no | Ignore `params` and match any value for every route parameter. |

| Status | Meaning |
| --- | --- |
| `200` | Purged. The body is `{}`. |
| `400` | `contentType` was missing, or names a content type that is not cached. |
| `401` | Not authenticated as an admin. |
| `403` | Authenticated, but without the `cache.purge` permission. |

With `clearRelatedCache` on (the default), this also purges the content types
related to the one you named — see
[related content types](./index.md#related-content-types).

## Content API

```http
POST /api/rest-cache/purge
```

::: tip Since 5.1.0
Off by default, behind `strategy.enableContentApiPurge`.
:::

Same body, same validation, same result as the admin endpoint — for callers
that have no admin session: a deploy pipeline, a webhook from an upstream
system, a scheduled job.

It is off by default and returns **404** while it is, rather than 403: a
disabled endpoint should not announce that it exists. Purging is destructive
and cheap to trigger, so it should not appear on your public API surface merely
because you upgraded the plugin.

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

module.exports = {
  "rest-cache": {
    config: {
      strategy: {
        enableContentApiPurge: true,
        contentTypes: ["api::article.article"],
      },
    },
  },
};
```

```ts [TypeScript]
// file: ./config/plugins.ts

export default {
  "rest-cache": {
    config: {
      strategy: {
        enableContentApiPurge: true,
        contentTypes: ["api::article.article"],
      },
    },
  },
};
```

::::

Enabling the flag is not enough on its own. The route inherits Strapi's
content-api authentication, so the caller must present an API token or a
users-permissions JWT, **and** the action `plugin::rest-cache.purge.contentApi`
must be granted — to the caller's role under **Settings → Users & Permissions →
Roles**, or within the API token's scope.

```bash
curl -X POST https://example.com/api/rest-cache/purge \
  -H "Authorization: Bearer $STRAPI_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "contentType": "api::article.article", "wildcard": true }'
```

::: warning Grant it narrowly
Give this to a dedicated API token with nothing else in its scope. Anyone who
can call it can empty your cache repeatedly, which is a cheap way to put load
straight onto your database.
:::

## From your own code

Both services are reached through the plugin:

```js
const cacheStore = strapi.plugin("rest-cache").service("cacheStore");
const cacheConfig = strapi.plugin("rest-cache").service("cacheConfig");
```

### cacheStore

The cache itself.

| Method | Description |
| --- | --- |
| `clearByUid(uid, params?, wildcard?)` | Purge a content type. The same call the admin UI, both HTTP endpoints and automatic invalidation make. Throws if the uid is not configured. |
| `clearByRegexp(regExps)` | Purge every key matching any of the given patterns. Patterns are tested against logical keys, without `keysPrefix`. |
| `reset()` | Empty the cache. |
| `keys()` | Every key currently held, with `keysPrefix` stripped. |
| `get(key)` | Read one entry. Bounded by `provider.getTimeout`; a timeout reads as `null`. |
| `set(key, value, maxAge?)` | Write one entry. `maxAge` is milliseconds. |
| `del(key)` / `delMany(keys)` | Delete one key, or a batch in a single provider call. |
| `ready` | Whether the provider is initialised and usable. |

```js
// Purge everything cached for a content type.
await cacheStore.clearByUid("api::article.article", {}, true);

// Purge one document's entries.
await cacheStore.clearByUid("api::article.article", { id: documentId });

// Purge by pattern — for example every locale variant of one path.
await cacheStore.clearByRegexp([/^\/api\/pages\/about\?/]);
```

::: warning `reset()` without a `keysPrefix`
With a `keysPrefix` configured, `reset()` deletes only the keys carrying that
prefix. Without one it clears everything the provider holds — which, on a Redis
database shared with anything else, means everything that other thing held too.
Set `keysPrefix` whenever the store is not exclusively the plugin's.
:::

### cacheConfig

Read access to the resolved strategy. Useful for deciding whether to purge at
all before doing work.

| Method | Description |
| --- | --- |
| `getUids()` | Every configured content type uid. |
| `get(uid)` | The resolved configuration for one content type, or `undefined`. |
| `isCached(uid)` | Whether a content type is configured. |
| `getCacheKeysRegexp(uid, params?, wildcard?)` | The patterns a purge for that content type would use. |
| `getRelatedCachedUid(uid)` | The content types related to this one that are themselves cached. |

::: warning Deprecated
`cacheConfig.clearCache(uid, params, wildcard)` still works and logs a
deprecation warning. Use `cacheStore.clearByUid` instead — it is the same
operation, on the service that owns the cache.
:::

### Example: purging after a write the plugin cannot see

```js
// file: ./src/api/article/services/import.js

module.exports = ({ strapi }) => ({
  async importFromUpstream(rows) {
    // Bypasses the document service, so nothing invalidates automatically.
    await strapi.db.query("api::article.article").createMany({ data: rows });

    await strapi
      .plugin("rest-cache")
      .service("cacheStore")
      .clearByUid("api::article.article", {}, true);
  },
});
```

The same shape works from a cron job, a webhook handler, or a lifecycle hook on
a model you write to directly.

## Choosing params or wildcard

`params` substitutes values into the route paths configured for the content
type, so `{ id: "abc" }` resolves `/api/articles/:id` to `/api/articles/abc`. A
route whose parameters cannot all be filled in is skipped rather than guessed
at — so a `/api/articles/slug/:slug` route is not matched by an `id`.

`wildcard: true` replaces every parameter with a match-anything pattern and
clears the lot. Use it when you cannot enumerate what changed, which is most of
the time for manual purges.

See
[route parameters and purging](../caching/custom-routes.md#route-parameters-and-purging)
for the details.

## Next

- [Invalidation](./index.md) — what happens without you asking.
- [Admin panel](../admin/index.md) — the dashboard and content-manager controls.
- [Configuration reference](../reference/config.md) — every option.
