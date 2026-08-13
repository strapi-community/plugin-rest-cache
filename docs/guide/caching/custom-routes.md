---
title: Caching custom routes
---

# {{ $frontmatter.title }}

Default routes are inferred; anything else has to be named. A route you wrote
yourself, a route added by a plugin, or a default route you replaced — all of
them are cached by listing them under the content type they belong to.

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

module.exports = {
  "rest-cache": {
    config: {
      strategy: {
        contentTypes: [
          {
            contentType: "api::category.category",
            routes: [
              // Shorthand: a GET route with the content type's settings.
              "/api/categories/featured",

              // Full form.
              {
                path: "/api/categories/slug/:slug+",
                method: "GET",
                maxAge: 18000, // 18 seconds, in milliseconds
                keys: {
                  useQueryParams: ["populate", "locale"],
                  useHeaders: [],
                },
              },
            ],
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
            contentType: "api::category.category",
            routes: [
              // Shorthand: a GET route with the content type's settings.
              "/api/categories/featured",

              // Full form.
              {
                path: "/api/categories/slug/:slug+",
                method: "GET",
                maxAge: 18000, // 18 seconds, in milliseconds
                keys: {
                  useQueryParams: ["populate", "locale"],
                  useHeaders: [],
                },
              },
            ],
          },
        ],
      },
    },
  },
};
```

::::

Custom routes are added to whatever the content type already had. Listing
routes does not switch off `injectDefaultRoutes`; set that to `false` yourself
if you want only the routes you named.

## Writing the path

The path must be the path **as Strapi registered it**, including the API
prefix. That is `/api/categories/slug/:slug`, not `/categories/slug/:slug` —
the prefix is part of the registered path, and the plugin compares the two
strings.

Parameters are written exactly as in your route file, including the `+` marker
on a repeatable parameter (`:slug+`). The marker is normalised on both sides
before comparison, so writing it or omitting it both match; leaving it off used
to leave such routes silently uncached.

A path that matches nothing is skipped. There is no boot failure, because
plugins and APIs come and go between environments and a hard failure would be
worse — but it does mean a typo is invisible unless you look. With
`debug: true`, boot logs one line per registered route:

```
[REGISTER] GET /api/categories/slug/:slug+ recv maxAge=18000
[WARNING] route "[GET] /api/categories/featured" not registered in strapi, ignoring...
```

That is the fastest way to confirm a custom route took effect.

## Only GET is cached

The cache middleware is attached to `GET` routes only. A route listed with
another method is not stored and not looked up; it exists in the configuration
so that the legacy, route-based invalidation path can purge on it. With the
default document-service invalidation, non-`GET` entries do nothing at all. See
[Invalidation](../invalidation/index.md).

## Per-route overrides

A route inherits `maxAge`, `hitpass` and `keys` from its content type, which in
turn inherits from the strategy. Overriding on the route is how you say "this
one is different":

- A search endpoint whose query string carries a free-text term probably wants
  a short `maxAge`, or `useQueryParams` restricted to the parameters that
  genuinely change the answer, so that one bot appending tracking parameters
  cannot fill the store with near-duplicate entries.
- A route serving per-locale content wants `locale` in the key; a route that
  ignores the query string entirely wants `useQueryParams: false`.

See [Cache keys](./keys.md) for what each option does to the key.

## Which content type to attach a route to

A custom route is registered under exactly one content type, and that choice
matters: the route's entries are purged when **that** content type is written.

Attach the route to the content type whose changes should invalidate it. A
`/api/categories/slug/:slug` route belongs under `api::category.category`
because a category edit is what makes its response wrong. If the response also
depends on another content type, `clearRelatedCache` — on by default — will
usually cover it, because related content types are derived from your schema's
relations and components.

::: warning
A custom route can only be registered within a single content type. If a
response genuinely depends on two unrelated content types and neither relates
to the other in the schema, cache it briefly, or purge it yourself from a
lifecycle hook. See [Purging](../invalidation/purging.md#from-your-own-code).
:::

## Route parameters and purging

Parameter names are read out of the path (`:slug` → `slug`) and used to build
the patterns a purge matches against. A purge can only fill in the parameters
it was given:

- **Wildcard purges** replace every parameter with a match-anything pattern, so
  they clear the route regardless of its parameters.
- **Targeted purges** substitute the parameters they were handed. A purge
  carrying `{ id: "abc123" }` can resolve `/api/categories/:id`, but it cannot
  resolve `/api/categories/slug/:slug` — nothing tells it which slug that
  document has — so that pattern is dropped rather than guessed at.

In practice this rarely bites, because `clearRelatedCache` is on by default and
a content type belongs to its own related set: purging it also issues a
wildcard purge for itself, which does cover parameterised custom routes. Turn
`clearRelatedCache` off and the narrowing becomes visible — a
`/slug/:slug` entry then survives a targeted write until `maxAge` expires or
something purges with `wildcard: true`.

## Plugin routes

Content types owned by a plugin have no generated API routes, so there is
nothing to infer. Name the content type by its uid, turn off default route
injection, and list the routes:

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

module.exports = {
  "rest-cache": {
    config: {
      strategy: {
        contentTypes: [
          {
            contentType: "plugin::users-permissions.user",
            injectDefaultRoutes: false,
            routes: ["/api/users"],
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
            contentType: "plugin::users-permissions.user",
            injectDefaultRoutes: false,
            routes: ["/api/users"],
          },
        ],
      },
    },
  },
};
```

::::

::: warning Think before caching user data
`/api/users` responses depend on who is asking. The default `hitpass` already
prevents them being cached at all, since they carry an `authorization` header.
If you disable it, set [`keys.useAuth`](./keys.md#useauth) as well, or one
user's response will be served to another.
:::

## Next

- [Cache keys](./keys.md) — how a request becomes a key.
- [Invalidation](../invalidation/index.md) — when entries are thrown away.
- [Configuration reference](../reference/config.md#routes) — the full route
  option table.
