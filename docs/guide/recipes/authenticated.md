---
title: Caching authenticated responses
---

# {{ $frontmatter.title }}

## When this applies

Your API is read-heavy but the readers are logged in — a customer portal, a
dashboard, a mobile app that authenticates every request. The default
configuration caches none of this, because the shipped `hitpass` bypasses any
request carrying an `authorization` or `cookie` header. That default is
deliberately conservative, and turning it off is the single change in this
plugin most likely to leak one user's data to another. It is safe only in
combination with per-caller keys.

::: tip Since 5.1.0
`keys.useAuth` was added in 5.1.0. On earlier versions there is no safe way to
cache authenticated traffic, and the honest answer is not to.
:::

## Configuration

Scope it to the content types that need it rather than setting it on the
strategy. Most of an API does not need authenticated caching, and a strategy-level
`hitpass: false` opts in everything you cache, including things you add later
without thinking about it.

:::: code-group

```js [JavaScript]
// file: ./config/plugins.js

module.exports = {
  "rest-cache": {
    config: {
      provider: { name: "memory" },
      strategy: {
        maxAge: 3600000, // 1 hour
        enableXCacheHeaders: true,

        contentTypes: [
          // Public content: default hitpass, no per-caller keys, one shared
          // entry. Nothing changes here.
          "api::article.article",

          {
            // Per-user data. Cached, but never shared between callers.
            contentType: "api::order.order",

            // These two belong together. Neither is safe alone.
            hitpass: false,
            keys: {
              useAuth: true,
              useQueryParams: true,
              useHeaders: [],
            },

            // Shorter, because a permission change is not a content change
            // and does not purge anything.
            maxAge: 120000, // 2 minutes
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
        maxAge: 3600000, // 1 hour
        enableXCacheHeaders: true,

        contentTypes: [
          // Public content: default hitpass, no per-caller keys, one shared
          // entry. Nothing changes here.
          "api::article.article",

          {
            // Per-user data. Cached, but never shared between callers.
            contentType: "api::order.order",

            // These two belong together. Neither is safe alone.
            hitpass: false,
            keys: {
              useAuth: true,
              useQueryParams: true,
              useHeaders: [],
            },

            // Shorter, because a permission change is not a content change
            // and does not purge anything.
            maxAge: 120000, // 2 minutes
          },
        ],
      },
    },
  },
};
```

::::

## Why these values

**`hitpass: false` and `keys.useAuth: true`, together.** `hitpass: false` says
"stop skipping the cache for credentialed requests". `useAuth: true` says "give
each caller their own entry". The first without the second is the dangerous
combination: nothing else in a cache key distinguishes two logged-in users —
same path, same query string, same headers — so the first one to miss decides
what everyone else sees until the entry expires. The second without the first is
merely useless: `useAuth` adds a component to keys that are never written,
because `hitpass` bypassed them.

::: warning The server tells you when you get this wrong
Strapi logs a warning at boot naming any content type with `hitpass: false` and
no `keys.useAuth`, and the admin dashboard shows it as a **Shared across
callers** badge on that content type's row. If you see either, treat it as a
data-exposure bug rather than a configuration nit.
:::

**`keys` is replaced wholesale, not merged.** Writing
`keys: { useAuth: true }` on its own gives you the *defaults* for the fields you
left out, not the strategy's values. Spell out `useQueryParams` and `useHeaders`
whenever you set `keys` at a lower level, as above.

**A short `maxAge`.** Invalidation fires on content writes, so an order changing
purges its entries. What it does not fire on is a change to *who may see what* —
editing a role's permissions, revoking a token's scope, moving a user between
roles. Those change the correct response without changing any content, and
nothing purges. A short lifetime bounds how long a caller keeps seeing what they
were entitled to a moment ago.

::: info
Deleting a users-permissions role is the exception: it resets the entire cache,
because there is no way to work out which entries a removed role affected. Do not
generalise that to every permission edit.
:::

**Nothing about `useHeaders: ["authorization"]`.** It is possible, older
documentation suggested it, and it is worse: it puts a live credential into your
store's keyspace, and it keys on the *token* rather than the user, so one person
with two sessions gets two entries and a re-issued token starts cold. See
[the note in Cache keys](../caching/keys.md#useheaders).

## What the key looks like

`useAuth` appends the caller's identity, derived from `ctx.state.auth`:

| Caller | Component |
| --- | --- |
| A users-permissions user | `up:<id>` |
| An anonymous caller (the public role) | `up:public` |
| An API token | `token:<id>:<type>` |
| An admin user or admin token | `admin:<id>` |

So `GET /api/orders` produces `/api/orders?&&up:7` for user 7 and
`/api/orders?&&up:9` for user 9 — two entries, no overlap. The identity is
appended *after* the path rather than prefixed, which is what keeps per-caller
entries matching the same purge patterns as everything else: purging
`api::order.order` clears every caller's copy, not just the anonymous one. The
full breakdown is in [Cache keys](../caching/keys.md#useauth).

## Check it works

Two different callers must never share a hit. With two tokens:

```bash
A="Bearer $TOKEN_USER_A"
B="Bearer $TOKEN_USER_B"

curl -s -o /dev/null -D - -H "Authorization: $A" \
  http://localhost:1337/api/orders | grep -i x-cache
# X-Cache: MISS

curl -s -o /dev/null -D - -H "Authorization: $A" \
  http://localhost:1337/api/orders | grep -i x-cache
# X-Cache: HIT   <- same caller, served from cache

curl -s -o /dev/null -D - -H "Authorization: $B" \
  http://localhost:1337/api/orders | grep -i x-cache
# X-Cache: MISS  <- different caller, different entry
```

That third line is the whole test. If it says `HIT`, user B was just served
user A's response, and `keys.useAuth` is not in effect on that content type.

Compare against a content type you did *not* opt in — `/api/articles` with an
`Authorization` header should report `HITPASS`, meaning the default `hitpass`
bypassed it.

## Watch out for

**Entry count multiplies by your user count.** One shared entry per URL becomes
one per caller per URL. Ten thousand active users on a route with a handful of
query-string variants is a large number of entries, and on the memory provider
the LRU starts evicting at `maxSize` (32,767 by default) — usually evicting the
entry it was about to need. Either raise the bound, move to
[Redis](../providers/redis.md), or restrict `useQueryParams` to an allow-list to
keep the per-caller variant count down.

**The public role gets an entry too.** An unauthenticated request to an opted-in
route is keyed `up:public`, which is correct — every anonymous caller genuinely
does share one response — but it means the route is now cached for anonymous
traffic as well, where before `hitpass` had nothing to bypass. Check that the
public role's view of that content type is something you are happy to hold.

**Custom authentication strategies get their own bucket, not a per-user one.**
Anything the plugin does not recognise keys as `strategy:<name>`, so every
caller using that strategy shares one entry. That is a deliberate choice — it is
visible rather than silently per-user-wrong — but if you have a custom strategy,
do not enable `hitpass: false` on routes it serves.

**Responses that set a `Set-Cookie` are never stored**, whatever you configure.
Replaying one would hand a caller's session, CSRF token or consent state to
everybody sharing the key. This applies whether or not `useAuth` is on, and it
means login and session-refresh endpoints cannot be cached even by accident.
See [what is never stored](../caching/index.md#what-is-never-stored).
<Badge type="tip" text="since 5.1.0" />

**Controllers that filter on `ctx.state.user` are the reason this is per-user
rather than per-role.** Two people with identical roles are still owed different
responses when the controller narrows by user id. If you were tempted to key on
the role to cut cardinality, that is why the plugin does not.

## Related

- [Cache keys → useAuth](../caching/keys.md#useauth)
- [Caching a content type](../caching/content-types.md#caching-authenticated-responses)
- [hitpass in the configuration reference](../reference/config.md#hitpass)
