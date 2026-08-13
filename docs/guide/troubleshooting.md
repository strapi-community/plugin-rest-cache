---
title: Troubleshooting
---

# {{ $frontmatter.title }}

## Nothing is being cached

**Check `X-Cache` first.** Set `enableXCacheHeaders: true` and look at the
response header. It tells you which of three things is happening.

`HITPASS` — the request bypassed the cache deliberately. The default `hitpass`
does this for anything carrying an `authorization` or `cookie` header, which
includes every request a browser makes while logged into the admin panel. Test
with `curl`, or read [per-caller keys](./caching/keys.md#per-caller-keys).

`MISS` every time — the response is being refused. The plugin will not store a
response that is empty, not `2xx`, a stream, sets a `Set-Cookie`, or says
`Cache-Control: no-store`/`private`. See
[what is never cached](./reference/config.md#what-is-never-cached).

No header at all — the route is not cached. The middleware was never attached
to it, which is a configuration problem rather than a runtime one. Open
**Settings → REST Cache** and look at the routes listed for the content type:
what you see there is what was actually resolved. A path that does not appear
did not match anything Strapi registered.

## A route I configured is not listed

The `path` must be the path **as Strapi registered it**, including the API
prefix — `/api/articles/slug/:slug`, not `/articles/slug/:slug`.

Enable [debug mode](#debug-mode); the plugin logs every configured route it
could not match:

```
[WARNING] route "[GET] /articles/slug/:slug" not registered in strapi, ignoring...
```

## Stale content after a write

Invalidation runs from the document service by default, which covers REST,
GraphQL, the content manager, Content Releases and any `strapi.documents()`
call. Content changed **directly in the database** bypasses all of that, and
nothing can observe it. Purge manually — see [Purging](./invalidation/purging.md).

If the write did go through Strapi, check that `enableDocumentServiceMiddleware`
is on in **Settings → REST Cache**. With it off, the plugin falls back to
route-injected middleware, which only sees writes that arrive over a route it
knows about.

## Everything expires far too late

`maxAge` is **milliseconds**. `3600` is 3.6 seconds, not an hour; `3600000` is
an hour. The dashboard renders the resolved value in human units (`1h`, `30m`),
which is the quickest way to confirm what a content type actually has.

## Purging clears more than I expected

`clearRelatedCache` is on by default: purging a content type also purges those
related to it through relations and components, transitively. The dashboard
shows the count per row ("Also purges 4 related types"). Turn it off if you
would rather accept staleness in related responses.

## Redis: entries are written but never purged

Check that `strategy.keysPrefix` matches the `keyPrefix` your Redis connection
uses. The plugin filters and strips its own prefix when enumerating keys; a
mismatch means it enumerates nothing and every purge silently does nothing.

## Debug mode

```js
strategy: {
  debug: true,
}
```

This enables the plugin's `debug` namespace, which logs route registration,
every cache hit and miss with its key, and every purge with the number of keys
removed. You can also enable it without changing configuration:

```bash
DEBUG=strapi:plugin-rest-cache npm run develop
```

## Getting help

Open an issue at
[strapi-community/plugin-rest-cache](https://github.com/strapi-community/plugin-rest-cache/issues).
Include your `rest-cache` configuration, your Strapi and Node versions, and the
`X-Cache` header for the request that behaved unexpectedly — that header
usually identifies the problem on its own.
