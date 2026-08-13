---
name: diagnose-rest-cache
description: Diagnose why Strapi REST Cache is not caching, is serving stale content, or is caching the wrong thing. Use when responses are not being cached, X-Cache shows MISS or HITPASS unexpectedly, content stays stale after an edit, or one user sees another user's data.
---

# Diagnosing REST Cache

Work through this in order. Do not guess at configuration changes before
establishing which of the failure modes is happening — they look identical from
the outside and have completely different causes.

## Step 1: get the `X-Cache` header

This single header identifies the problem in most cases. It is off by default.

```js
// ./config/plugins.js
strategy: {
  enableXCacheHeaders: true,
}
```

Restart Strapi, then request the failing route **twice** with `curl` — not a
browser:

```bash
curl -sI http://localhost:1337/api/articles | grep -i x-cache
curl -sI http://localhost:1337/api/articles | grep -i x-cache
```

Then branch on what you see.

## `X-Cache: HITPASS`

The request deliberately bypassed the cache. This is the most common false
alarm.

The shipped `hitpass` skips any request carrying an `authorization` or `cookie`
header. **A browser logged into the admin panel sends a cookie on every
request**, so testing in a browser tab will always show HITPASS.

- Testing from a browser? Retest with `curl`, or a private window with no
  session.
- Genuinely need authenticated traffic cached? That requires turning `hitpass`
  off **and** turning on per-caller keys. Doing the first without the second
  makes two callers share one entry. Read
  https://strapi-community.github.io/plugin-rest-cache/guide/recipes/authenticated.html

## `X-Cache: MISS` every time

The response is being refused. The plugin will not store a response that:

- is empty, or has a non-`2xx` status;
- is a stream (it can only be consumed once);
- sets a `Set-Cookie` header — replaying that would hand one caller's session
  to everybody;
- says `Cache-Control: no-store` or `private`.

Check the response headers of the failing request for `Set-Cookie` and
`Cache-Control`. A custom middleware or controller setting either of these is
the usual cause.

## No `X-Cache` header at all

The route is not cached — the middleware was never attached to it. This is
configuration, not runtime.

1. Is the content type listed in `strategy.contentTypes`? Nothing is cached
   until it is named.
2. Is it a **custom route**? Those must be listed explicitly, and `path` must
   be the path **as Strapi registered it, including the API prefix** —
   `/api/articles/slug/:slug`, not `/articles/slug/:slug`.
3. Turn on `strategy.debug: true` (or run with
   `DEBUG=strapi:plugin-rest-cache`). Routes that could not be matched are
   logged:

   ```
   [WARNING] route "[GET] /articles/slug/:slug" not registered in strapi, ignoring...
   ```

4. If the admin panel is available, open **Settings → REST Cache**. The routes
   listed per content type are the ones actually resolved. A route missing
   there did not match.

## Stale content after an edit

Invalidation runs from Strapi's document service, which covers REST, GraphQL,
the content manager, Content Releases and any `strapi.documents()` call.

- Was the content changed **directly in the database**? Nothing can observe
  that. Purge manually.
- Otherwise check `enableDocumentServiceMiddleware` is on (it is by default).
  With it off, the plugin only sees writes arriving on routes it knows about.

## Entries expire far too late, or immediately

`maxAge` is **milliseconds**. `3600` is 3.6 seconds; `3600000` is one hour.
This is the single most common configuration mistake.

## One caller sees another caller's data

Stop and treat this as urgent.

It means responses that vary per caller are being cached under a key that does
not identify the caller. Either `hitpass` was disabled without setting
`keys.useAuth: true`, or a route returns per-user data while being treated as
public.

Immediate mitigation: re-enable `hitpass` for that content type, and purge.
Then read the authenticated-caching recipe before re-enabling.

## Multiple instances behaving inconsistently

The `memory` provider is per-process. Two Strapi instances have two independent
caches, and a purge on one does not reach the other — so one instance serves
fresh content and another serves stale. Use the Redis provider.
https://strapi-community.github.io/plugin-rest-cache/guide/recipes/multi-instance.html

## Still stuck

Collect: plugin/Strapi/Node versions, the provider, the `rest-cache` config
block, the `X-Cache` value, and the `DEBUG=strapi:plugin-rest-cache` output.
Open an issue with the bug report form:
https://github.com/strapi-community/plugin-rest-cache/issues/new/choose
