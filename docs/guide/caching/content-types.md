---
title: Caching a content type
---

# {{ $frontmatter.title }}

The plugin caches nothing until you list the content types it should cache.
That list is `strategy.contentTypes`, and each entry is either a uid string or
an object.

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

module.exports = {
  "rest-cache": {
    config: {
      strategy: {
        contentTypes: [
          // Shorthand: cache this content type's default routes, using the
          // strategy-level maxAge, hitpass and keys.
          "api::article.article",

          // Full form, for anything that needs to differ.
          {
            contentType: "api::category.category",
            maxAge: 60000, // 1 minute, in milliseconds
          },
        ],
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
        contentTypes: [
          // Shorthand: cache this content type's default routes, using the
          // strategy-level maxAge, hitpass and keys.
          "api::article.article",

          // Full form, for anything that needs to differ.
          {
            contentType: "api::category.category",
            maxAge: 60000, // 1 minute, in milliseconds
          },
        ],
      },
    },
  },
};
```

::::

A uid that does not resolve to a content type fails the boot with
`contentType uid "…" not found`, rather than being ignored. A silently ignored
typo is a cache that never caches and never says why.

## Which routes this registers

With `injectDefaultRoutes` on (the default), the plugin looks at the API the
content type belongs to and registers its default REST routes. The API prefix
from `api.rest.prefix` (`/api` unless you changed it) is included.

For a **collection type** with plural name `articles`:

| Route | Cached |
| --- | --- |
| `GET /api/articles` | yes |
| `GET /api/articles/:id` | yes |
| `POST /api/articles` | no — used only for route-based invalidation |
| `PUT /api/articles/:id` | no — used only for route-based invalidation |
| `DELETE /api/articles/:id` | no — used only for route-based invalidation |

For a **single type** with singular name `homepage`:

| Route | Cached |
| --- | --- |
| `GET /api/homepage` | yes |
| `PUT /api/homepage` | no — used only for route-based invalidation |
| `DELETE /api/homepage` | no — used only for route-based invalidation |

Only `GET` responses are ever stored or looked up. The write routes appear in
the resolved strategy because the legacy, route-based invalidation path needs
them; with the default document-service invalidation they are inert. See
[Invalidation](../invalidation/index.md).

The `:id` segment is also what a targeted purge fills in — purging
`api::article.article` with `{ id: "abc123" }` clears `/api/articles/abc123`
and the collection route, without touching every other entry.

To confirm what was actually registered, open **Settings → REST Cache**: each
content type lists its resolved routes. A route you expected and cannot find
there was never registered.

## Inheritance

`maxAge`, `hitpass` and `keys` exist at three levels and each inherits from the
one above it:

```
strategy  →  content type  →  route
```

A content type that sets nothing behaves exactly like the strategy defaults. A
content type that sets `keys` replaces the strategy's `keys` for itself and for
every route it owns, unless a route sets its own.

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

module.exports = {
  "rest-cache": {
    config: {
      strategy: {
        maxAge: 3600000, // 1 hour, in milliseconds
        keys: { useQueryParams: true, useHeaders: [] },

        contentTypes: [
          // Inherits both.
          "api::article.article",

          {
            // Prices change often and are the same for everyone.
            contentType: "api::product.product",
            maxAge: 30000, // 30 seconds
            keys: { useQueryParams: ["filters", "locale", "page"] },
          },
        ],
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
        maxAge: 3600000, // 1 hour, in milliseconds
        keys: { useQueryParams: true, useHeaders: [] },

        contentTypes: [
          // Inherits both.
          "api::article.article",

          {
            // Prices change often and are the same for everyone.
            contentType: "api::product.product",
            maxAge: 30000, // 30 seconds
            keys: { useQueryParams: ["filters", "locale", "page"] },
          },
        ],
      },
    },
  },
};
```

::::

## Content types without default routes

`injectDefaultRoutes: false` stops the plugin looking for default routes. You
need it in two cases.

**A content type owned by a plugin.** Plugins do not have generated API routes,
so there is nothing to inject; the plugin skips them automatically, and any
route you want cached has to be [listed explicitly](./custom-routes.md).

**A content type whose API has no routes**, because you deleted or replaced
them. The plugin raises

```
no API "<name>" found for contentType "<uid>".
Set "injectDefaultRoutes: false" for this contentType if it has no default routes.
```

rather than crashing later with something unrelated.

::: info Content types not named after their API
The owning API is resolved from the uid, not from the content type's singular
name. `api::writer.editor` lives in the `writer` API even though its singular
name is `editor`. Deriving it from the name instead used to take the whole
application down at register time with "Cannot read properties of undefined".
([#125](https://github.com/strapi-community/plugin-rest-cache/issues/125))
:::

## Related content types

While resolving your configuration the plugin walks each content type's
schema and records everything it can reach through **relations** and through
**components**, following components into their own attributes until nothing
new is found. That set is what `clearRelatedCache` uses: purging a content type
also purges the cached entries of the content types related to it.

You do not configure this list — it is derived from your schemas — but it is
worth knowing it exists, because it explains purges that look wider than the
write that caused them. See
[Invalidation](../invalidation/index.md#related-content-types).

## Caching authenticated responses

A content type can opt out of the default `hitpass` and cache authenticated
traffic. If you do that, key entries on the caller as well:

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

module.exports = {
  "rest-cache": {
    config: {
      strategy: {
        contentTypes: [
          {
            contentType: "api::order.order",
            hitpass: false, // cache even with an authorization header
            keys: { useAuth: true }, // ...but one entry per caller
          },
        ],
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
        contentTypes: [
          {
            contentType: "api::order.order",
            hitpass: false, // cache even with an authorization header
            keys: { useAuth: true }, // ...but one entry per caller
          },
        ],
      },
    },
  },
};
```

::::

::: warning
`hitpass: false` without `keys.useAuth` means every authorised caller shares one
entry. The server logs a warning at boot naming the content type. See
[Cache keys](./keys.md#useauth).
:::

## Next

- [Caching custom routes](./custom-routes.md) — routes the plugin cannot infer.
- [Cache keys](./keys.md) — what makes two requests share an entry.
- [Configuration reference](../reference/config.md) — every option in one table.
