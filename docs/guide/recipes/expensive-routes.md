---
title: A few expensive routes
---

# {{ $frontmatter.title }}

## When this applies

Your API is mostly fine. Two or three endpoints are not: an aggregate that scans
a large table, a search that joins four content types, a report that recomputes
on every call, a homepage payload with a `populate` tree deep enough to generate
a dozen queries. You do not want a blanket cache — you want those specific
paths, held for a long time, and nothing else touched.

This is the case where caching pays for itself most obviously, and also the case
where the default route injection gets in the way, because the routes you care
about are ones you wrote by hand.

## Configuration

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

module.exports = {
  "rest-cache": {
    config: {
      provider: { name: "memory" },
      strategy: {
        // Default for anything added later without its own maxAge.
        maxAge: 60000, // 1 minute
        enableXCacheHeaders: true,
        debug: true, // temporarily: confirms the routes registered

        contentTypes: [
          {
            contentType: "api::report.report",

            // Do not register this content type's default REST routes.
            // Only the routes listed below are cached.
            injectDefaultRoutes: false,

            // These are expensive and change rarely. 6 hours.
            maxAge: 21600000,

            routes: [
              // Shorthand: a GET route inheriting the settings above.
              "/api/reports/annual-summary",

              {
                path: "/api/reports/breakdown/:year",
                method: "GET",
                maxAge: 43200000, // 12 hours: last year's numbers are final
                keys: {
                  // Only these change the answer. Everything else collapses.
                  useQueryParams: ["region", "currency"],
                  useHeaders: [],
                },
              },
            ],
          },

          {
            contentType: "api::product.product",
            injectDefaultRoutes: false,
            routes: [
              {
                path: "/api/products/search",
                maxAge: 300000, // 5 minutes: results move, and cardinality is high
                keys: {
                  useQueryParams: ["q", "category", "page"],
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
      provider: { name: "memory" },
      strategy: {
        // Default for anything added later without its own maxAge.
        maxAge: 60000, // 1 minute
        enableXCacheHeaders: true,
        debug: true, // temporarily: confirms the routes registered

        contentTypes: [
          {
            contentType: "api::report.report",

            // Do not register this content type's default REST routes.
            // Only the routes listed below are cached.
            injectDefaultRoutes: false,

            // These are expensive and change rarely. 6 hours.
            maxAge: 21600000,

            routes: [
              // Shorthand: a GET route inheriting the settings above.
              "/api/reports/annual-summary",

              {
                path: "/api/reports/breakdown/:year",
                method: "GET",
                maxAge: 43200000, // 12 hours: last year's numbers are final
                keys: {
                  // Only these change the answer. Everything else collapses.
                  useQueryParams: ["region", "currency"],
                  useHeaders: [],
                },
              },
            ],
          },

          {
            contentType: "api::product.product",
            injectDefaultRoutes: false,
            routes: [
              {
                path: "/api/products/search",
                maxAge: 300000, // 5 minutes: results move, and cardinality is high
                keys: {
                  useQueryParams: ["q", "category", "page"],
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

## Why these values

**`injectDefaultRoutes: false`.** Without it, naming a content type also
registers its generated `GET /api/reports` and `GET /api/reports/:id` routes.
That is usually what you want and is not what you want here: you asked for two
endpoints and would have got four, two of which you never measured. Setting it
to `false` and listing routes by hand means the configuration says exactly what
it does.

It is also required, rather than merely tidy, for content types owned by a
plugin, and for a content type whose API routes you deleted or replaced — in the
latter case the plugin refuses to boot and tells you to set it.

**Routes are additive, `injectDefaultRoutes` is not implied.** Listing `routes`
does not switch default injection off by itself. If you want only the routes you
named, say so.

**Cheap endpoints are absent, not configured short.** Nothing is cached until
it is listed. A route the plugin was not told about carries no middleware and
therefore no overhead at all — the cache middleware is injected onto matching
routes at register time. The strategy-level `maxAge: 60000` is not "the cache
for everything else"; it is just the default inherited by whatever you add next.

**Very long `maxAge` on the report routes.** These are the entries you least
want to recompute, and invalidation still purges them when a report document is
written, so the long lifetime only governs staleness against changes the plugin
cannot see. Twelve hours on a finalised year's breakdown is not reckless; twelve
hours on a live search would be.

**A short `maxAge` and a tight `useQueryParams` on search.** Search is the
opposite trade: the answers move, and the query space is unbounded. Naming the
parameters that genuinely change the result stops one crawler appending tracking
parameters from filling the store with near-duplicate entries. See
[Locales and query-heavy APIs](./i18n-and-query.md).

**The content type each route is attached to matters.** A route is registered
under exactly one content type, and its entries are purged when *that* content
type is written. `/api/products/search` belongs under `api::product.product`
because a product edit is what makes its response wrong.

## Coalescing matters most here

<Badge type="tip" text="since 5.1.0" />

Request coalescing is automatic and needs no configuration, but it is worth
knowing why it matters disproportionately on this recipe. When several requests
for the same missing key arrive at once, exactly one calls the origin and the
rest wait on its result.

On a cheap endpoint that saves a few queries. On a six-second aggregate it is
the difference between one six-second query and fifty concurrent ones — and the
moments it fires are precisely the worst moments: a cold start, the instant
after a purge, and `maxAge` expiry, when a long-lived popular entry drops and
every client asks for it in the same second.

A failure is not shared: if the leading request errors, the waiters fall through
and fetch independently rather than inheriting the error.

## Check it works

First confirm the routes actually registered. With `debug: true`, boot logs one
line per route:

```
[REGISTER] GET /api/reports/annual-summary recv maxAge=21600000
[REGISTER] GET /api/reports/breakdown/:year recv maxAge=43200000
[WARNING] route "[GET] /api/products/search" not registered in strapi, ignoring...
```

That last line is the failure you are looking for. A path that matches nothing
is skipped silently — there is no boot error, because plugins and APIs differ
between environments — so the log is the only thing that tells you. The same
information is in **Settings → REST Cache**, which lists the resolved routes per
content type.

Then measure. The point of this recipe is latency, so look at it:

```bash
curl -s -o /dev/null -D - -w 'time: %{time_total}s\n' \
  http://localhost:1337/api/reports/annual-summary | grep -iE 'x-cache|time'
# X-Cache: MISS
# time: 6.214s

curl -s -o /dev/null -D - -w 'time: %{time_total}s\n' \
  http://localhost:1337/api/reports/annual-summary | grep -iE 'x-cache|time'
# X-Cache: HIT
# time: 0.021s
```

And confirm the routes you deliberately excluded are untouched:

```bash
curl -s -o /dev/null -D - http://localhost:1337/api/reports | grep -ic x-cache
# 0   <- no X-Cache header at all: the plugin never saw this route
```

## Watch out for

**The path must be the path as Strapi registered it**, including the API prefix:
`/api/reports/breakdown/:year`, not `/reports/breakdown/:year`. The plugin
compares strings. Parameter markers on repeatable parameters (`:slug+`) are
normalised on both sides, so writing or omitting the `+` both match, but the
prefix is not optional.

**A typo is invisible without the log.** This is the single most common reason a
route in this recipe appears to do nothing. Check the `[REGISTER]` lines, then
turn `debug` back off.

**Only `GET` is stored.** Listing a route with another method neither stores nor
looks anything up; those entries exist only for the legacy route-based
invalidation path, and are inert under the default document-service
invalidation.

**A response that depends on two unrelated content types has no correct home.**
`clearRelatedCache` (on by default) widens each purge through relations and
components transitively, which covers most cross-content-type reports. If two
content types are genuinely unrelated in your schema, neither purges the other:
cache the route briefly, or
[purge it yourself](../invalidation/purging.md#from-your-own-code) from a
lifecycle hook.

**A targeted purge cannot resolve a parameter it was not given.** A write to one
report purges `/api/reports/:id`-shaped patterns; it cannot know which `:year`
that document corresponds to. In practice `clearRelatedCache` covers this,
because a content type belongs to its own related set and so also gets a
wildcard purge. Turn `clearRelatedCache` off and parameterised custom routes
survive until `maxAge` — which, at twelve hours, you would notice.

## Related

- [Caching custom routes](../caching/custom-routes.md)
- [Request coalescing](../caching/index.md#request-coalescing)
- [Route options reference](../reference/config.md#routes)
