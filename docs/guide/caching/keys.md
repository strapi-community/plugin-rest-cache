---
title: Cache keys
---

# {{ $frontmatter.title }}

A cache key is the plugin's answer to "have I already got this?". Two requests
that produce the same key share one stored response. Everything you configure
under `keys` is a decision about which differences between requests matter.

## How a key is built

```
`${requestPath}?${querySuffix}&${headersSuffix}&${authSuffix}`
```

Four parts, always in this order, and the separators are always present even
when a part is empty:

| Part | Built from | Configured by |
| --- | --- | --- |
| `requestPath` | The request path, normalised and lower-cased, with any trailing slash removed | — |
| `querySuffix` | The query parameters, sorted by name | `useQueryParams` |
| `headersSuffix` | The named request headers, lower-cased | `useHeaders` |
| `authSuffix` | The authenticated caller's identity | `useAuth` |

With the defaults (`useQueryParams: true`, no headers, no auth), a request for
`GET /api/articles?populate=*` stores under:

```
/api/articles?populate=*&&
```

The two trailing separators are not a bug — they are the empty header and auth
components. Keys look like this in `cacheStore.keys()` output and in debug
logs, so it is worth recognising the shape.

A few more, for a content type configured with
`useQueryParams: false`, `useHeaders: ["accept-encoding"]` and `useAuth: true`:

| Request | Key |
| --- | --- |
| `GET /api/categories`, anonymous | `/api/categories?&&up:public` |
| `GET /api/categories?sort=name`, anonymous | `/api/categories?&&up:public` |
| `GET /api/categories` with `Accept-Encoding: gzip`, anonymous | `/api/categories?&accept-encoding=gzip&up:public` |
| `GET /api/categories` as user 7 | `/api/categories?&&up:7` |

### The details that matter

- **The path is normalised and lower-cased.** `/API/Articles/` and
  `/api/articles` are the same entry.
- **Query parameters are sorted by name**, so `?a=1&b=2` and `?b=2&a=1` share
  an entry. Values are not sorted or normalised: `?sort=name` and
  `?sort=NAME` are different entries, because query strings are
  case-sensitive to Strapi.
- **Nested parameters** (`filters[title][$eq]=x`, which Strapi parses into an
  object) are serialised with `JSON.stringify` before going into the key.
- **Header names are lower-cased**, and the configured list is sorted once at
  boot, so the key does not depend on the order you wrote them in. A header
  that is absent from the request contributes nothing.
- **The auth component is appended, never prefixed.** This is load-bearing:
  purge patterns are anchored on the route path (`^/api/articles\?`), so
  anything placed in front of the path would stop matching and authenticated
  entries would quietly survive every purge.

Two things are stored per response when `enableEtag` is on: the body under the
key, and the ETag under the same key with `_etag` appended.

`keysPrefix` is applied by the store when reading and writing, and stripped
again on the way out. The logical key — what purge patterns match against, and
what `cacheStore.keys()` returns — never includes it.

## Where to configure keys

`keys` can be set on the strategy, on a content type, or on a single route,
each inheriting from the one above:

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

module.exports = {
  "rest-cache": {
    config: {
      strategy: {
        // Default for everything.
        keys: { useQueryParams: true, useHeaders: [] },

        contentTypes: [
          {
            contentType: "api::category.category",
            // Default for this content type and its routes.
            keys: { useQueryParams: false, useHeaders: ["accept-encoding"] },
            routes: [
              {
                path: "/api/categories/slug/:slug+",
                // Just for this route.
                keys: { useQueryParams: ["populate", "locale"], useHeaders: [] },
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
        // Default for everything.
        keys: { useQueryParams: true, useHeaders: [] },

        contentTypes: [
          {
            contentType: "api::category.category",
            // Default for this content type and its routes.
            keys: { useQueryParams: false, useHeaders: ["accept-encoding"] },
            routes: [
              {
                path: "/api/categories/slug/:slug+",
                // Just for this route.
                keys: { useQueryParams: ["populate", "locale"], useHeaders: [] },
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

`keys` is replaced wholesale, not merged field by field: a route that sets
`keys` gets the defaults for anything it leaves out, not the content type's
values.

## useQueryParams

- **Type:** `boolean | string[]`
- **Default:** `true`

| Value | Effect |
| --- | --- |
| `true` | Every query parameter is part of the key. |
| `["populate", "locale"]` | Only the named parameters count. Everything else is ignored. |
| `false` | The query string is ignored entirely. Every query for the path shares one entry. |

`true` is correct and safe: any difference in the query string produces a
different entry, so nobody ever receives a response to a different question.
The cost is cardinality. Every distinct combination of parameters is its own
entry, so a crawler appending `utm_*` parameters, or a client that sends
`populate` fields in a varying order, multiplies your entry count and your miss
rate without changing a single response.

An allow-list is the fix. Name the parameters that genuinely change the answer
and let the rest collapse into one entry.

`false` is for endpoints whose response does not depend on the query string at
all — typically a single type. Be sure of that before setting it: with
`useQueryParams: false`, `GET /api/categories?filters[x]=1` is served the
response computed for `GET /api/categories`.

## useHeaders

- **Type:** `string[]`
- **Default:** `[]`

The list of request headers whose values become part of the key — the
equivalent of an HTTP `Vary`. Use it when the same URL produces genuinely
different responses depending on a header, such as a custom locale, tenant or
channel header.

Each header you add multiplies the number of entries for that route by the
number of distinct values it takes, so add the ones you need and no more.

::: warning Not for `authorization`
It is possible to put `authorization` here, and older versions of this
documentation suggested it. Prefer [`useAuth`](#useauth). Keying on the raw
header puts a credential into the store's keyspace, and it keys on the *token*
rather than the user — so one user with two sessions gets two entries, and a
re-issued token starts from a cold cache.
:::

## useAuth

::: tip Since 5.1.0
`keys.useAuth` was added in 5.1.0. Before it, the only way to cache
authenticated traffic safely was not to.
:::

- **Type:** `boolean`
- **Default:** `false`

Adds the authenticated caller's identity to the key, so each caller gets their
own entry.

This only matters when you have turned `hitpass` off. The default `hitpass`
never caches a request carrying an `authorization` or `cookie` header at all,
which is why the plugin is safe without this option.

The value is derived from `ctx.state.auth`:

| Caller | Component |
| --- | --- |
| A users-permissions user | `up:<id>` |
| An anonymous caller (the public role) | `up:public` |
| An API token | `token:<id>:<type>` |
| An admin user or admin token | `admin:<id>` |
| A route with authentication disabled | `unauthenticated` |
| Any other authentication strategy | `strategy:<name>` |

Users are keyed per user, not per role: controllers routinely filter on
`ctx.state.user.id`, so two people with the same role can still be owed
different responses. An API token's `type` is part of the key because it is
editable — downgrading a token from full-access to read-only changes what the
same token id may see. An unrecognised strategy gets its own bucket rather than
sharing one, so a custom authentication strategy cannot silently leak responses
between callers.

::: info Nothing secret or volatile goes into the key
Only the identifier and, for tokens, the type. `auth.credentials` for a
users-permissions caller is the raw user row — including the password hash and
reset tokens — so it must never be serialised wholesale into a key that ends up
in a log line or a Redis keyspace. An API token's `lastUsedAt` is rewritten
roughly hourly, so including it would invalidate the cache on a timer for no
reason. ([#113](https://github.com/strapi-community/plugin-rest-cache/issues/113))
:::

### Why you need it whenever hitpass is off

Nothing else in a key distinguishes one authenticated caller from another. The
path, the query string and the headers are frequently identical between two
users who are both authorised for a route and who should nonetheless see
different data — because the controller filters on the user, or because their
tokens carry different permissions.

Cache that without `useAuth` and the first caller to miss decides what everyone
else sees, until the entry expires.

The server logs a warning at boot when it finds a content type with
`hitpass: false` and no `keys.useAuth`, naming the content type. The admin
dashboard shows the same thing as a **Shared across callers** badge, because
nobody reads boot logs.

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
            hitpass: false,
            keys: { useAuth: true, useQueryParams: true, useHeaders: [] },
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
            hitpass: false,
            keys: { useAuth: true, useQueryParams: true, useHeaders: [] },
          },
        ],
      },
    },
  },
};
```

::::

Because the identity is appended after the path, per-caller entries are matched
by the same purge patterns as everything else — purging a content type clears
every caller's copy, not just the anonymous one.

## Inspecting keys

`cacheStore.keys()` returns every key currently held, with `keysPrefix`
stripped:

```js
const keys = await strapi.plugin("rest-cache").service("cacheStore").keys();
```

With `debug: true`, every request logs its key and outcome:

```
[RECV] GET /api/articles?populate=*&& HIT
[RECV] GET /api/articles?populate=*&& MISS
[RECV] GET /api/articles?populate=*&& HITPASS
```

If two requests you expected to share an entry both report `MISS`, comparing
their keys tells you which component differs.

## Next

- [How caching works](./index.md) — where the key sits in the request path.
- [Invalidation](../invalidation/index.md) — how keys are matched when purging.
- [Configuration reference](../reference/config.md#keys) — the option table.
