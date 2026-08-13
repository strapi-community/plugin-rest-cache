---
title: A public content API
---

# {{ $frontmatter.title }}

## When this applies

You serve content that is the same for everybody: a marketing site, a blog, a
documentation site, a mobile app's public catalogue. Reads outnumber writes by
orders of magnitude, editors change content through the admin panel, and no
response depends on who is asking. This is the case the plugin's defaults were
built around, so the configuration below is mostly the defaults with the
lifetime turned up and the diagnostics turned on.

## Configuration

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

module.exports = {
  "rest-cache": {
    config: {
      provider: {
        name: "memory",
        options: {
          // Entry count, not bytes. The LRU evicts past this.
          maxSize: 32767,
        },
      },
      strategy: {
        // 24 hours, in milliseconds. Invalidation is what makes this safe.
        maxAge: 86400000,

        enableEtag: true,
        enableXCacheHeaders: true,

        keys: {
          useQueryParams: true,
          useHeaders: [],
        },

        contentTypes: [
          "api::article.article",
          "api::category.category",
          "api::page.page",
          {
            // Prices and stock move on their own schedule.
            contentType: "api::product.product",
            maxAge: 300000, // 5 minutes
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
      provider: {
        name: "memory",
        options: {
          // Entry count, not bytes. The LRU evicts past this.
          maxSize: 32767,
        },
      },
      strategy: {
        // 24 hours, in milliseconds. Invalidation is what makes this safe.
        maxAge: 86400000,

        enableEtag: true,
        enableXCacheHeaders: true,

        keys: {
          useQueryParams: true,
          useHeaders: [],
        },

        contentTypes: [
          "api::article.article",
          "api::category.category",
          "api::page.page",
          {
            // Prices and stock move on their own schedule.
            contentType: "api::product.product",
            maxAge: 300000, // 5 minutes
          },
        ],
      },
    },
  },
};
```

::::

## Why these values

**`maxAge: 86400000`.** A day is a long time to hold a copy of something, and
it is fine here because `maxAge` is not how entries normally die. Every write
through Strapi's document service purges what it affected — REST, GraphQL, the
content manager, a scheduled Content Release at 3am — so an entry lives from the
last edit until the next one, not for a fixed hour. See
[Invalidation](../invalidation/index.md). `maxAge` is the backstop for the
things invalidation cannot see, and the right length for it is "how long could
I tolerate being wrong if something changed behind the plugin's back".

Shortening it to an hour does not make you meaningfully fresher; it just
multiplies your miss rate by 24 for the same correctness.

**No `hitpass` line.** The default already bypasses any request carrying an
`authorization` or `cookie` header, which is exactly right here: your public
readers carry neither, and your logged-in editors carry both. Editors see live
content while anonymous readers are served from cache, without you configuring
anything. Leave it alone.

**`enableEtag: true`.** A hit still serialises and sends the whole body. With
ETags on, a client that already has the response sends `If-None-Match` and gets
a `304` with no body at all. This is bandwidth, not database load, so it helps
repeat visitors and mobile clients rather than your server.

**`useQueryParams: true`.** Any difference in the query string is a different
entry, so nobody can ever be served the answer to a different question. The cost
is cardinality — see [Locales and query-heavy APIs](./i18n-and-query.md) if your
clients send long or varied query strings.

**A shorter `maxAge` on one content type.** Overrides inherit
`strategy` → content type → route, so naming `api::product.product` in full form
changes only its lifetime and leaves everything else on the strategy defaults.

**`provider: memory`.** Correct for one Strapi process. If you run more than
one, or your process restarts often enough that a cold cache is a problem, read
[Several instances, one cache](./multi-instance.md) instead — this is the single
most common way a working configuration stops working.

## Check it works

```bash
curl -s -o /dev/null -D - http://localhost:1337/api/articles | grep -i x-cache
# X-Cache: MISS

curl -s -o /dev/null -D - http://localhost:1337/api/articles | grep -i x-cache
# X-Cache: HIT
```

Then edit an article in the admin panel and repeat. The next request is a `MISS`
again — that is invalidation working, and it is what licenses the 24-hour
`maxAge`.

To confirm ETags:

```bash
ETAG=$(curl -s -o /dev/null -D - http://localhost:1337/api/articles \
  | awk 'tolower($1) == "etag:" { print $2 }' | tr -d '\r')

curl -s -o /dev/null -w '%{http_code}\n' \
  -H "If-None-Match: $ETAG" http://localhost:1337/api/articles
# 304
```

## Watch out for

**A long `maxAge` is only safe for changes the plugin can see.** Writes made
with `strapi.db.query(...)` or raw SQL, a database restored from backup, or an
upstream system your responses embed — none of those purge anything, and with a
24-hour `maxAge` the staleness lasts a day. If you have any of those, either
[purge explicitly](../invalidation/purging.md#from-your-own-code) from the code
that does the writing, or lower `maxAge` to whatever staleness you can live
with.

**A deploy that changes response shape does not purge anything.** New
`populate` defaults, a changed controller, a new field in a transform — the
content did not change, so nothing invalidates. Set `resetOnStartup: true`, or
call the [purge endpoint](../invalidation/purging.md#content-api) from your
deploy pipeline.

**`maxSize` is an entry count, not a memory budget.** With
`useQueryParams: true` a crawler appending `utm_*` parameters produces a new
entry per URL variant, and the LRU will happily hold 32,767 large responses in
your Node heap before it starts evicting. Size it against how big your responses
actually are.

::: tip
`enableXCacheHeaders` is diagnostic output. Turning it off once you are happy is
reasonable; leaving it on is also reasonable if a CDN or reverse proxy sits in
front of Strapi and you want to see which layer answered.
:::

## Related

- [How caching works](../caching/index.md)
- [Caching a content type](../caching/content-types.md)
- [Invalidation](../invalidation/index.md)
- [Configuration reference](../reference/config.md)
