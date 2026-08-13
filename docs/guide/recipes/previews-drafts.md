---
title: Previews and drafts
---

# {{ $frontmatter.title }}

## When this applies

Editors need to see what they are about to publish, exactly as it is right now.
Anything cached is by definition a copy of a moment that has passed, which makes
preview and cache directly opposed. The goal here is not to cache preview
traffic well — it is to make sure it is never cached at all, while leaving the
public cache untouched.

This covers Strapi 5's Preview feature, a frontend running in draft mode, and
any `?status=draft` request.

## Most of this is already handled

The shipped `hitpass` bypasses any request carrying an `authorization` or
`cookie` header:

```js
hitpass: (ctx) =>
  Boolean(ctx.request.headers.authorization || ctx.request.headers.cookie);
```

Draft content is not public. Reading it requires permission, so a preview
request carries an API token or a JWT, which means the default already bypasses
it. If you have not changed `hitpass`, previews are safe today and you can stop
reading — verify with the curl below and move on.

You need the rest of this page in two cases: you turned `hitpass` off (see
[Caching authenticated responses](./authenticated.md)), or your preview path
does not carry credentials on the request that reaches Strapi — typically
because a frontend server holds the token and forwards a request of its own with
a preview flag instead.

## Configuration

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

module.exports = {
  "rest-cache": {
    config: {
      provider: { name: "memory" },
      strategy: {
        maxAge: 3600000,
        enableXCacheHeaders: true,

        // Replaces the default entirely, so the credential checks are
        // repeated here on purpose.
        hitpass: (ctx) =>
          Boolean(
            ctx.request.headers.authorization ||
              ctx.request.headers.cookie ||
              // A header your preview frontend sets.
              ctx.request.headers["x-preview"] ||
              // Strapi's draft view.
              ctx.query.status === "draft" ||
              ctx.query.preview === "true"
          ),

        keys: {
          // status must stay in the key even with hitpass covering it.
          useQueryParams: true,
          useHeaders: [],
        },

        contentTypes: ["api::article.article", "api::page.page"],
      },
    },
  },
};
```

```ts [TypeScript]
// file: ./config/plugins.ts

import type { Context } from "koa";

export default {
  "rest-cache": {
    config: {
      provider: { name: "memory" },
      strategy: {
        maxAge: 3600000,
        enableXCacheHeaders: true,

        // Replaces the default entirely, so the credential checks are
        // repeated here on purpose.
        hitpass: (ctx: Context) =>
          Boolean(
            ctx.request.headers.authorization ||
              ctx.request.headers.cookie ||
              // A header your preview frontend sets.
              ctx.request.headers["x-preview"] ||
              // Strapi's draft view.
              ctx.query.status === "draft" ||
              ctx.query.preview === "true"
          ),

        keys: {
          // status must stay in the key even with hitpass covering it.
          useQueryParams: true,
          useHeaders: [],
        },

        contentTypes: ["api::article.article", "api::page.page"],
      },
    },
  },
};
```

::::

Scoping it to one content type works the same way, if only part of your API has
a preview path:

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

contentTypes: [
  "api::category.category", // default hitpass
  {
    contentType: "api::page.page",
    hitpass: (ctx) =>
      Boolean(
        ctx.request.headers.authorization ||
          ctx.request.headers.cookie ||
          ctx.request.headers["x-preview"]
      ),
  },
],
```

```ts [TypeScript]
// file: ./config/plugins.ts

contentTypes: [
  "api::category.category", // default hitpass
  {
    contentType: "api::page.page",
    hitpass: (ctx: Context) =>
      Boolean(
        ctx.request.headers.authorization ||
          ctx.request.headers.cookie ||
          ctx.request.headers["x-preview"]
      ),
  },
],
```

::::

## Why these values

**The credential checks are repeated.** `hitpass` is replaced, not extended. A
custom function that only checks `x-preview` silently opts every authenticated
request in the world back into the cache — which is the failure mode the
[authenticated recipe](./authenticated.md) exists to prevent. Whatever you add,
keep the `authorization` and `cookie` checks unless you have deliberately
decided otherwise.

**`hitpass` means neither read nor write.** A bypassed request does not consult
the cache, and its response is not stored. That second half is the important one
for previews: a draft response can never end up in the store, so it can never be
served to a public reader later.

**A header rather than a query parameter, where you have the choice.** A query
parameter is part of the cache key and therefore part of the public URL surface:
it is shareable, it ends up in logs and analytics, and a link containing it
escapes into the wild. A header is set by your frontend and nothing else. Both
work; the header is tidier.

**`useQueryParams: true` alongside it.** `hitpass` and the key are independent
mechanisms, and belt-and-braces is right here. If `status` is part of the key,
then even a request that somehow escapes `hitpass` writes to a *different* entry
than the published one, rather than overwriting it.

## Check it works

A preview request must report `HITPASS`, and must not populate the cache for
anyone else:

```bash
# Warm the public entry.
curl -s -o /dev/null -D - http://localhost:1337/api/pages/home | grep -i x-cache
# X-Cache: MISS
curl -s -o /dev/null -D - http://localhost:1337/api/pages/home | grep -i x-cache
# X-Cache: HIT

# The preview request bypasses it in both directions.
curl -s -o /dev/null -D - -H 'X-Preview: 1' \
  http://localhost:1337/api/pages/home | grep -i x-cache
# X-Cache: HITPASS

curl -s -o /dev/null -D - \
  -H "Authorization: Bearer $PREVIEW_TOKEN" \
  'http://localhost:1337/api/pages/home?status=draft' | grep -i x-cache
# X-Cache: HITPASS
```

Then edit the draft without publishing and repeat the preview request. It must
show the new content every time — if it ever shows the old content, something is
serving from cache.

::: tip HITPASS is the success condition here
On most pages `X-Cache: HITPASS` is a sign that caching is not happening where
you wanted it. On this one it is the thing you are trying to achieve.
:::

## Watch out for

**A narrowed `useQueryParams` allow-list that omits `status`.** This is the
sharpest edge on this page. If a content type uses
`useQueryParams: ["locale", "populate"]` and something reaches the cache with
`?status=draft`, the draft response is stored under the same key as the
published one — and then served to the public until it expires. If you use an
allow-list, `status` belongs in it. See
[Locales and query-heavy APIs](./i18n-and-query.md).

**`hitpass` does not remove entries that already exist.** It stops new ones
being written. If unpublished content was cached before you fixed the
configuration, the bad entries are still there until `maxAge` or a purge. After
changing `hitpass`, [purge the affected content types](../invalidation/purging.md)
once.

**A preview flag on a request that a public client can also send.** If
`?preview=true` bypasses the cache and anyone may send it, you have given the
internet a way to route every request past your cache and straight to the
database. It does not expose draft content — Strapi's permissions still decide
that — but it is a cheap denial-of-service. Prefer a header your frontend sets
server-side, and if the flag is public, make sure the underlying route is one
your database can serve uncached.

**Publishing itself is covered.** The publish action goes through the document
service, so it purges the content type's entries like any other write — there is
no gap between "editor clicks publish" and "the public cache is correct" that
you need to close by hand. Scheduled Content Releases are covered for the same
reason, which is exactly the case a route-based invalidation cannot see.

**Do not use `hitpass` as an access control.** It decides whether the cache is
consulted, nothing else. Whether a caller may read draft content is Strapi's
permission system, and a bypassed request is still served whatever the
controller decides to serve.

## Related

- [hitpass in the configuration reference](../reference/config.md#hitpass)
- [How caching works → hitpass](../caching/index.md#hitpass)
- [Invalidation](../invalidation/index.md) — publish, unpublish and discard
- [Caching authenticated responses](./authenticated.md)
