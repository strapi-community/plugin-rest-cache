---
name: configure-rest-cache
description: Choose and write a Strapi REST Cache configuration for a specific use case. Use when setting up @strapi-community/plugin-rest-cache, deciding what to cache and for how long, picking between the memory and redis providers, caching authenticated or per-locale responses, or tuning cache keys.
---

# Configuring REST Cache

Do not write a configuration before establishing the four things below. Most
bad cache configurations are bad because one of them was assumed.

## Establish first

1. **How many Strapi instances run in production?** More than one means the
   memory provider is wrong — each process would hold its own cache and a purge
   would only reach one of them. That decision is not tunable later without
   changing infrastructure.
2. **Is the traffic public, authenticated, or both?** Authenticated caching is
   safe only with per-caller keys, and is off by default for that reason.
3. **Which routes actually hurt?** Caching everything is rarely the goal.
   A few expensive endpoints often account for most of the load.
4. **How stale may content be?** Usually the answer is "it may not be" — which
   is fine, because invalidation is automatic. `maxAge` is a backstop for
   changes nothing observed, not the primary mechanism.

Ask the user these if the answers are not already evident from their project.

## Then pick a starting point

Each of these is a complete, copy-pasteable configuration with the trade-offs
written out. Prefer sending the user to the matching one over inventing a
config from scratch.

| Situation | Recipe |
| --- | --- |
| Public, read-heavy content API | [public-content](https://strapi-community.github.io/plugin-rest-cache/guide/recipes/public-content.html) |
| Per-user or token-authenticated responses | [authenticated](https://strapi-community.github.io/plugin-rest-cache/guide/recipes/authenticated.html) |
| Several instances behind a load balancer | [multi-instance](https://strapi-community.github.io/plugin-rest-cache/guide/recipes/multi-instance.html) |
| Only a few slow endpoints | [expensive-routes](https://strapi-community.github.io/plugin-rest-cache/guide/recipes/expensive-routes.html) |
| i18n, or heavy filter/pagination/populate use | [i18n-and-query](https://strapi-community.github.io/plugin-rest-cache/guide/recipes/i18n-and-query.html) |
| Preview or draft workflows | [previews-drafts](https://strapi-community.github.io/plugin-rest-cache/guide/recipes/previews-drafts.html) |

Full option reference:
https://strapi-community.github.io/plugin-rest-cache/guide/reference/config.html

## Rules that are not negotiable

**Durations are milliseconds.** `maxAge: 3600` is 3.6 seconds. One hour is
`3600000`. Write the value with a comment saying what it is in human units.

**Never set `hitpass: false` without `keys.useAuth: true`.** Together they
cache authenticated traffic keyed per caller. `hitpass: false` alone means two
callers authorised for the same route share one entry, and whoever misses first
decides what everybody else sees. The server logs a warning at boot if you do
this, and the admin panel flags the content type — but by then it is already
serving.

**Custom route paths must include the API prefix**, exactly as Strapi
registered them: `/api/articles/slug/:slug`.

**Match `keysPrefix` to your Redis `keyPrefix`** if the connection sets one.
A mismatch means the plugin enumerates nothing, and every purge silently does
nothing.

## Sanity-check the result

Have the user turn on `enableXCacheHeaders`, then:

```bash
curl -sI http://localhost:1337/api/articles | grep -i x-cache   # MISS
curl -sI http://localhost:1337/api/articles | grep -i x-cache   # HIT
```

Then edit that content in the admin panel and request again — it should be
`MISS`, proving invalidation works.

`HITPASS` means the request bypassed the cache; with the default `hitpass` a
browser session will always do that. Test with `curl`.

If any of that does not behave, switch to the `diagnose-rest-cache` skill.

## Writing the config

Both `./config/plugins.js` and `./config/plugins.ts` are supported. Match
whichever the project already uses, and keep the plugin's block under the
`rest-cache` key with everything inside `config`.
