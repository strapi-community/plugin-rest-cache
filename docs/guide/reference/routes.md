---
title: Routes reference
---

# {{ $frontmatter.title }}

## Admin routes

Mounted at `/rest-cache/*` — **not** under `/admin`. Every one requires an
authenticated admin plus the listed permission, enforced server-side by an
`admin::hasPermissions` policy.

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/rest-cache/config/strategy` | `cache.read-strategy` | The resolved strategy, including the routes matched for each content type. |
| `GET` | `/rest-cache/config/provider` | `cache.read-provider` | The provider's `name` and `getTimeout`. |
| `GET` | `/rest-cache/stats` | `cache.read-strategy` | What the cache currently holds. <Badge type="tip" text="since 5.1.0" /> |
| `POST` | `/rest-cache/purge` | `cache.purge` | Purge a content type. |

Permissions are granted under **Settings → Roles**, and are named in full as
`plugin::rest-cache.cache.purge` and so on.

::: warning The provider's options are never returned
`GET /rest-cache/config/provider` deliberately returns only `name` and
`getTimeout`. The provider's `options` are passed straight to the adapter, and
for Redis that is where connection details live — `@keyv/redis` accepts a
`redis://user:password@host` URI there. Holding the permission to read this
endpoint does not make someone an operator entitled to credentials.
:::

### POST /rest-cache/purge

```json
{
  "contentType": "api::article.article",
  "params": { "id": 42 },
  "wildcard": false
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `contentType` | `string` | yes | The uid to purge. `400` if it is not a cached content type. |
| `params` | `object` | no | Route parameters used to narrow the purge. |
| `wildcard` | `boolean` | no | Ignore `params` and clear everything for the content type. |

### GET /rest-cache/stats

```json
{
  "provider": { "name": "memory" },
  "strategy": {
    "enableEtag": true,
    "enableXCacheHeaders": true,
    "enableDocumentServiceMiddleware": true,
    "clearRelatedCache": true,
    "keysPrefix": "",
    "maxAge": 3600000
  },
  "totals": { "entries": 4, "etags": 4, "contentTypes": 5 },
  "contentTypes": [
    {
      "uid": "api::article.article",
      "entries": 2,
      "maxAge": 3600000,
      "hitpass": true,
      "keysAuthIdentity": false,
      "routes": ["/api/articles", "/api/articles/:id"],
      "relatedContentTypes": ["api::category.category"]
    }
  ]
}
```

Counts are derived from the store's own key list rather than tracked
separately, so they cannot drift from reality. That does mean a call costs one
key enumeration — cheap on Redis, but not something to poll aggressively.

## Content API route

<Badge type="tip" text="since 5.1.0" />

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/rest-cache/purge` | Purge a content type from outside the admin panel. |

**Disabled by default.** Set `strategy.enableContentApiPurge: true` to enable
it; while disabled it responds `404`.

Even when enabled it inherits Strapi's content-API authentication, so a caller
must present an API token or a users-permissions JWT, **and** the route must be
granted to that role or token under **Settings → Users & Permissions** before
it can be reached.

It is off by default because purging is destructive and cheap to trigger, and
should not appear on your public API surface merely because you upgraded.

The request body is the same as the admin purge route.

::: details Why is it not `auth: false`?
Because an unauthenticated purge endpoint is a denial-of-service primitive: an
attacker who can empty your cache at will can put every request back onto the
database.
:::
