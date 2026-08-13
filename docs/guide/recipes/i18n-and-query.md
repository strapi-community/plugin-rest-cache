---
title: Locales and query-heavy APIs
---

# {{ $frontmatter.title }}

## When this applies

You run i18n with several locales, or your clients drive the API with long query
strings — `filters`, `populate`, `pagination`, `sort`, `fields`, `status` — or
both, which is the usual case. Everything works, but the cache hit rate is
disappointing and the entry count is larger than you expected.

This is not a bug. It is `useQueryParams` doing its job, and the recipe is about
deciding how much of that job you actually want.

## Locales are already correct

Query parameters are part of the cache key, so `?locale=fr` and `?locale=en`
produce different keys and therefore different entries:

```
/api/articles?locale=en&&
/api/articles?locale=fr&&
```

That is the desired behaviour and it needs no configuration. With
`useQueryParams: true` (the default), every locale variant of every path is its
own entry, and a French reader can never be served the English response.

The same is true of `?status=draft` versus the default published view, and of
every `populate` and `filters` variant. The default is correct. What it is not
is cheap.

## The cardinality problem

Every distinct combination of query parameters is a separate entry, with its own
first-request miss. A single path can generate a large number of them:

| Dimension | Distinct values |
| --- | --- |
| `locale` | 6 |
| `filters[category]` | 20 |
| `sort` | 3 |
| `pagination[page]` | 25 |

That is 9,000 entries for one route, before anyone appends a `utm_source`. Two
consequences follow:

- **Miss rate.** Each entry has to be missed once to exist. If your traffic is
  spread thinly across 9,000 variants, most requests are somebody's first, and
  the cache does very little.
- **Store size.** On the memory provider the LRU evicts past `maxSize` (32,767
  entries by default) — usually evicting the entry it is about to need. On Redis
  it is your memory bill.

Parameters that do not change the response are pure loss: a crawler appending
`utm_*`, an analytics parameter, or a client that serialises `populate` fields
in a varying order all multiply the entry count without changing a single byte
of any response.

## Configuration

An allow-list bounds it. Name the parameters that genuinely change the answer,
and let everything else collapse into one entry.

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

module.exports = {
  "rest-cache": {
    config: {
      provider: {
        name: "memory",
        options: { maxSize: 65536 },
      },
      strategy: {
        maxAge: 3600000,
        enableXCacheHeaders: true,

        // Safe default: everything counts.
        keys: { useQueryParams: true, useHeaders: [] },

        contentTypes: [
          {
            // High traffic, high query variety. Bound it.
            contentType: "api::article.article",
            keys: {
              useQueryParams: [
                "locale",
                "status",
                "filters",
                "sort",
                "pagination",
                "populate",
                "fields",
              ],
              useHeaders: [],
            },
            routes: [
              {
                // A landing route that only ever varies by locale.
                path: "/api/articles/featured",
                keys: {
                  useQueryParams: ["locale"],
                  useHeaders: [],
                },
              },
            ],
          },

          {
            // A single type: the response does not depend on the query at all.
            contentType: "api::global-setting.global-setting",
            keys: {
              useQueryParams: ["locale"],
              useHeaders: [],
            },
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
        options: { maxSize: 65536 },
      },
      strategy: {
        maxAge: 3600000,
        enableXCacheHeaders: true,

        // Safe default: everything counts.
        keys: { useQueryParams: true, useHeaders: [] },

        contentTypes: [
          {
            // High traffic, high query variety. Bound it.
            contentType: "api::article.article",
            keys: {
              useQueryParams: [
                "locale",
                "status",
                "filters",
                "sort",
                "pagination",
                "populate",
                "fields",
              ],
              useHeaders: [],
            },
            routes: [
              {
                // A landing route that only ever varies by locale.
                path: "/api/articles/featured",
                keys: {
                  useQueryParams: ["locale"],
                  useHeaders: [],
                },
              },
            ],
          },

          {
            // A single type: the response does not depend on the query at all.
            contentType: "api::global-setting.global-setting",
            keys: {
              useQueryParams: ["locale"],
              useHeaders: [],
            },
          },
        ],
      },
    },
  },
};
```

::::

## Why these values

**`useQueryParams: true` at the strategy level.** The safe value stays the
default, and narrowing is opt-in per content type. That way a content type you
add later is correct before it is efficient, rather than the other way round.

**The allow-list names top-level parameters.** Strapi parses bracketed query
strings into nested objects, and the plugin serialises the nested value with
`JSON.stringify` before it goes into the key. So the entry you list is
`filters`, not `filters[category][slug][$eq]`, and `pagination`, not
`pagination[page]` — the whole subtree is included or excluded as a unit.

**`locale` is in every list.** Drop it and every locale collapses into one
entry, and whichever language misses first becomes the site's language until the
entry expires. This is the most damaging single omission on an i18n project, and
it is silent.

**`status` is in the list.** `?status=draft` is a genuinely different response
from the published one. Leaving it out of an allow-list means a draft response
can be stored under the key a published request will read. See
[Previews and drafts](./previews-drafts.md).

**A narrower list on one route.** `/api/articles/featured` takes no filters, so
naming only `locale` collapses every tracking parameter a link-shortener might
append into a single entry per language. Route-level `keys` replace the content
type's, which replace the strategy's.

**`keys` is replaced wholesale, not merged.** A route that sets `keys` gets the
plugin defaults for anything it omits, not the content type's values — so spell
out `useHeaders` even when it is empty.

## Check it works

Locale variants must not share an entry:

```bash
curl -s -o /dev/null -D - 'http://localhost:1337/api/articles?locale=en' | grep -i x-cache
# X-Cache: MISS

curl -s -o /dev/null -D - 'http://localhost:1337/api/articles?locale=fr' | grep -i x-cache
# X-Cache: MISS   <- correct: a different entry, not a hit on the English one

curl -s -o /dev/null -D - 'http://localhost:1337/api/articles?locale=fr' | grep -i x-cache
# X-Cache: HIT
```

And a parameter you excluded from the allow-list must be ignored:

```bash
curl -s -o /dev/null -D - \
  'http://localhost:1337/api/articles?locale=fr&utm_source=newsletter' | grep -i x-cache
# X-Cache: HIT   <- utm_source is not in the list, so this is the same entry
```

If either of those reports the opposite of what you expect, `debug: true` prints
the key for every request, which tells you immediately which component differs:

```
[RECV] GET /api/articles?locale=fr&& HIT
```

You can also list what is actually held:

```js
await strapi.plugin("rest-cache").service("cacheStore").keys();
```

## Watch out for

**An allow-list is a promise that the omitted parameters do not change the
response.** Break that promise and two requests differing only in an unlisted
parameter share one entry — which means one of them gets the wrong answer, not a
slightly stale one. Before excluding a parameter, ask whether any client could
send it and expect a different body. `fields`, `populate` and `status` are the
ones people wrongly assume are cosmetic.

**Adding a query parameter to your frontend later is a cache correctness
change.** The allow-list does not update itself, and the failure is silent: no
error, no warning, just a response computed for a different request. Whoever
adds `?variant=b` has to add it to the list as well.

**`useQueryParams: false` is stronger than it looks.** It ignores the query
string entirely, so `GET /api/categories?filters[x]=1` is served the response
computed for `GET /api/categories`. It is only correct for endpoints whose
response genuinely cannot depend on the query — and on an i18n project it is
almost never correct, because `locale` is a query parameter.

**Query values are case-sensitive and not normalised.** `?sort=name` and
`?sort=NAME` are different entries. Parameter *names* are sorted, so `?a=1&b=2`
and `?b=2&a=1` do share one.

**Every entry in `useHeaders` multiplies the same way.** It is the same
cardinality trade in a different place. Add the headers whose values genuinely
change the response — a custom tenant or channel header — and no more.

## Related

- [Cache keys → useQueryParams](../caching/keys.md#usequeryparams)
- [Per-route overrides](../caching/custom-routes.md#per-route-overrides)
- [Memory provider → maxSize](../providers/memory.md#maxsize)
