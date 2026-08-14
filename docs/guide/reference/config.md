---
title: Configuration reference
---

# {{ $frontmatter.title }}

Every option the plugin accepts, with its type, default, and what it is for.
Configuration lives in `./config/plugins.js` (or `.ts`) under the `rest-cache`
key.

::: warning Durations are milliseconds
`maxAge` and the providers' `ttl` are **milliseconds**, everywhere, without
exception. `3600000` is one hour.

This is worth stating loudly because getting it wrong is silent: the plugin
once multiplied an already-millisecond value by 1000 before handing it to the
store, so a configured hour lived 41.7 days and nothing ever expired.
([#126](https://github.com/strapi-community/plugin-rest-cache/issues/126))
:::

## Shape

:::: code-group

```js [JavaScript]
// ./config/plugins.js
module.exports = {
  "rest-cache": {
    config: {
      provider: {
        /* ... */
      },
      strategy: {
        /* ... */
      },
    },
  },
};
```

```ts [TypeScript]
// ./config/plugins.ts
export default {
  "rest-cache": {
    config: {
      provider: {
        /* ... */
      },
      strategy: {
        /* ... */
      },
    },
  },
};
```

::::

## provider

Where cache entries are stored. See [Providers](../providers/index.md).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `name` | `string` | `"memory"` | Which provider to load. Resolves the package `@strapi-community/provider-rest-cache-<name>`. |
| `getTimeout` | `number` (ms) | `500` | How long a cache **read** may take before the plugin gives up and treats it as a miss. A slow store degrades to no cache rather than to a slow site. |
| `options` | `object` | provider-specific | Passed straight through to the provider. |

## strategy

What to cache, for how long, and how to key it.

### Top level

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `contentTypes` | `array` | `[]` | The content types to cache. See [below](#contenttypes). |
| `maxAge` | `number` (ms) | `3600000` | Default lifetime for an entry. Overridable per content type and per route. |
| `keys` | `object` | see [keys](#keys) | Default cache-key composition. Overridable per content type and per route. |
| `hitpass` | `function \| boolean` | bypasses requests with an `authorization` or `cookie` header | Decides per request whether to skip the cache entirely. See [hitpass](#hitpass). |
| `keysPrefix` | `string` | `""` | Prefixes every stored key, so the cache can share a keyspace with other consumers. If your Redis uses a `keyPrefix`, match it here. |
| `enableEtag` | `boolean` | `false` | Emit an `ETag` and answer `304 Not Modified` when it matches. |
| `enableXCacheHeaders` | `boolean` | `false` | Emit `X-Cache: HIT \| MISS \| HITPASS`. Useful in development and for debugging a CDN in front. |
| `cacheControl` | `object` | disabled — see [cacheControl](#cachecontrol) | Emit a `Cache-Control` header on responses this plugin cached. <Badge type="tip" text="since 5.1.0" /> |
| `enableDocumentServiceMiddleware` | `boolean` | `true` | Invalidate from the document service rather than from HTTP routes. See [Invalidation](../invalidation/index.md). <Badge type="tip" text="since 5.1.0" /> |
| `enableContentApiPurge` | `boolean` | `false` | Expose `POST /api/rest-cache/purge`. Off by default; see [Purging](../invalidation/purging.md). <Badge type="tip" text="since 5.1.0" /> |
| `enableAdminCTBMiddleware` | `boolean` | `true` | Inject purge middleware into the content-manager's admin routes. Superseded by `enableDocumentServiceMiddleware` and ignored while that is on. |
| `clearRelatedCache` | `boolean` | `true` | When a content type is purged, also purge content types related to it through relations and components, transitively. |
| `resetOnStartup` | `boolean` | `false` | Empty the cache when Strapi boots. |
| `debug` | `boolean` | `false` | Enable the plugin's `debug` logging namespace. See [Debugging](../troubleshooting.md). |

### contentTypes

Each entry is either a uid string, or an object for finer control.

```js
contentTypes: [
  // Shorthand: cache this content type's default routes with the defaults above.
  "api::article.article",

  // Full form.
  {
    contentType: "api::category.category",
    maxAge: 60000,
    hitpass: false,
    injectDefaultRoutes: true,
    keys: { useQueryParams: true, useHeaders: [], useAuth: true },
    routes: [
      /* ... */
    ],
  },
];
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `contentType` | `string` | — | The uid, e.g. `api::article.article`. Required. |
| `maxAge` | `number` (ms) | inherits `strategy.maxAge` | Entry lifetime for this content type. |
| `hitpass` | `function \| boolean` | inherits `strategy.hitpass` | Per-request bypass for this content type. |
| `keys` | `object` | inherits `strategy.keys` | Key composition for this content type. |
| `injectDefaultRoutes` | `boolean` | `true` | Register the content type's own REST routes automatically. Set to `false` for a content type with no default routes, or to list routes by hand. |
| `routes` | `array` | `[]` | Extra routes to cache. See [routes](#routes). |

::: info Content types owned by a plugin
Plugins do not have default API routes, so `injectDefaultRoutes` does nothing
for them. List their routes explicitly.
:::

### routes

Each entry is either a path string, or an object.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `path` | `string` | — | The path as Strapi registered it, including the API prefix, e.g. `/api/articles/slug/:slug`. Required. |
| `method` | `string` | `"GET"` | HTTP method. Only `GET` responses are stored; other methods are used to derive purges when running without the document service middleware. |
| `maxAge` | `number` (ms) | inherits the content type | Entry lifetime for this route. |
| `hitpass` | `function \| boolean` | inherits the content type | Per-request bypass for this route. |
| `keys` | `object` | inherits the content type | Key composition for this route. |
| `paramNames` | `string[]` | derived from `path` | Route parameter names. Derived automatically; only set this if you know you need to. |

### keys

How the cache key is built. See [Cache keys](../caching/keys.md) for the full
composition.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `useQueryParams` | `boolean \| string[]` | `true` | `true` includes every query parameter. An array includes only those named. `false` ignores the query string entirely — every query then shares one entry. |
| `useHeaders` | `string[]` | `[]` | Request headers to include in the key. Comparable to a `Vary`. |
| `useAuth` | `boolean` | `false` | Key entries per authenticated caller. <Badge type="tip" text="since 5.1.0" /> |

::: warning Caching authenticated responses
`useAuth` exists for the case where you have deliberately turned `hitpass`
off. Without it, two callers authorised for the same route share one entry, so
whoever misses first decides what everybody else sees.

The server logs a warning at boot when a content type sets `hitpass: false`
without `keys.useAuth`.
:::

### cacheControl

<Badge type="tip" text="since 5.1.0" />

Tells the caller about the caching, by putting a `Cache-Control` header on
responses this plugin served from, or just wrote to, its cache. Off by default,
and worth leaving off until you have read the caveat below.

Design and original implementation by
[@pinkasey](https://github.com/pinkasey) in
[#96](https://github.com/strapi-community/plugin-rest-cache/pull/96), carried
forward by
[#175](https://github.com/strapi-community/plugin-rest-cache/issues/175).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `false` | Emit the header at all. |
| `maxAge` | `"none" \| "config" \| number` (ms) | `"config"` | `"none"` omits the `max-age` directive, `"config"` uses the route's resolved `maxAge`, and a number overrides it. **Milliseconds**, like every other duration here; the plugin converts to the seconds the header wants. |
| `scope` | `"public" \| "private"` | `"private"` | `"private"` lets only the end client store the response. `"public"` also allows shared caches such as a CDN. |
| `staleWhileRevalidate` | `number` (ms) \| `null` | `null` | Emits `stale-while-revalidate`, allowing a cache to serve the stale response while it refreshes. `null` omits the directive. |

:::: code-group

```js [JavaScript]
// ./config/plugins.js
module.exports = {
  "rest-cache": {
    config: {
      strategy: {
        maxAge: 3600000, // one hour, in milliseconds
        cacheControl: {
          enabled: true,
          // The route is cached for an hour, so say so: "max-age=3600".
          maxAge: "config",
          scope: "public",
          staleWhileRevalidate: 60000, // "stale-while-revalidate=60"
        },
        contentTypes: ["api::article.article"],
      },
    },
  },
};
```

```ts [TypeScript]
// ./config/plugins.ts
export default {
  "rest-cache": {
    config: {
      strategy: {
        maxAge: 3600000,
        cacheControl: {
          enabled: true,
          // Or say something shorter than the server-side lifetime, so a purge
          // is felt sooner downstream: "max-age=60".
          maxAge: 60000,
          scope: "private",
        },
        contentTypes: ["api::article.article"],
      },
    },
  },
};
```

::::

The header is emitted only for a response the plugin actually cached. It is not
emitted for a `hitpass`, for a response the plugin
[refused to store](#what-is-never-cached), or when the handler already set a
`Cache-Control` of its own — a handler that said `no-store` is giving an
instruction, and it keeps winning.

::: danger A purge cannot reach a browser or a CDN
This is the whole trade. `POST /api/rest-cache/purge`, the admin button, and
the automatic invalidation on write all empty **this** cache. None of them can
reach a copy held by a browser or a CDN.

So every `max-age` you emit is a window of guaranteed staleness: publish a
correction, purge everything, and clients that already have the response will
keep serving the old one until their copy expires. Choose a `max-age` you would
be willing to be wrong for — `maxAge: "config"` on an hour-long cache means an
hour.

If your CDN supports it, purging the CDN belongs in the same operation as
purging Strapi.
:::

::: warning `scope: "public"` and `keys.useAuth`
Entries keyed per caller hold one caller's response. Advertising those as
`public` would let a shared cache hand user A's data to user B, somewhere the
server cannot see it happen or undo it.

The plugin does not rely on you getting this right: a route whose
[`keys.useAuth`](#keys) is set is emitted as `private` even when `scope` says
`public`, and the server logs a warning at boot naming the content type.
:::

::: info Handler-set headers are not replayed from the cache
The plugin caches the response body, not its headers. A handler that sets
`Cache-Control: max-age=10` on a cacheable response keeps that header on the
request it ran for, but a later cache HIT — where the handler does not run —
carries whatever `cacheControl` is configured to emit for that route.
:::

### hitpass

A function taking the Koa context and returning a boolean (or a promise of
one). `true` means bypass the cache for this request: nothing is read, and the
response is not stored.

The shipped default bypasses any request that carries an `authorization` or
`cookie` header, which is the conservative choice — it means authenticated
traffic is never accelerated, but also never shared between callers.

:::: code-group

```js [JavaScript]
// ./config/plugins.js
module.exports = {
  "rest-cache": {
    config: {
      strategy: {
        // Cache authenticated traffic, keyed per caller.
        hitpass: false,
        keys: { useAuth: true },
        contentTypes: ["api::article.article"],
      },
    },
  },
};
```

```ts [TypeScript]
// ./config/plugins.ts
import type { Context } from "koa";

export default {
  "rest-cache": {
    config: {
      strategy: {
        // Or decide per request.
        hitpass: (ctx: Context) => ctx.request.headers["x-preview"] === "1",
        contentTypes: ["api::article.article"],
      },
    },
  },
};
```

::::

## What is never cached

Independently of configuration, a response is not stored when:

- the handler took over the socket (`ctx.respond = false`);
- the body is empty, or the status is not `2xx`;
- the body is a stream — it can only be consumed once, so a stored copy could
  not be replayed;
- the response sets a `Set-Cookie` — replaying it would hand one caller's
  session to everybody sharing the key;
- the response says `Cache-Control: no-store` or `private`.

<Badge type="tip" text="since 5.1.0" /> — see
[#133](https://github.com/strapi-community/plugin-rest-cache/issues/133).
