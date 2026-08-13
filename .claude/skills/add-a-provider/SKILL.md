---
name: add-a-provider
description: Add a new cache provider package to this repository, or modify an existing one. Use when working in packages/provider-rest-cache-*, implementing a storage backend, or changing the CacheProvider contract.
---

# Adding a cache provider

A provider is a small package that stores and retrieves cache entries. The
contract is `packages/plugin-rest-cache/server/src/types/CacheProvider.ts` —
read it first; its comments cite the bugs each decision prevents.

## The contract

Required: `get(key)`, `set(key, value, maxAge)`, `del(key)`, `keys()`, and a
`ready` getter.

Optional: `delMany(keys)` and `clear()`. The base class supplies working
defaults, so a provider written against the older contract keeps working.
Override them when the backing store has batch operations — a purge is
otherwise one round trip per key, which on Redis meant roughly 20,000 round
trips and 55MB transferred for a 100k-entry cache.

## Rules that are not stylistic

**`maxAge` is milliseconds. Do not convert it.** cache-manager's ttl is also
milliseconds. Converting again is how a configured hour became 41.7 days.

**`keys()` must return unqualified keys**, without the store's prefix and
without any adapter-internal qualification. `@keyv/redis` tracks keys as
`keyv:/api/foo`; returning that form makes purge patterns match nothing while
the deletes address keys that do not exist.

**Keep the package CommonJS.** Providers are loaded via
`createRequire(...)(modulePath)`. If a dependency is ESM-only — `quick-lru` v7
is — resolve it through an async static `create()` rather than making the
package ESM. See `MemoryCacheProvider.create()`.

**Do not rename the provider class.** `bootstrap.ts` identifies a provider by
walking the constructor chain comparing `constructor.name`, because a provider
resolves its own copy of the types bundle and a real `instanceof` is false.
A rename breaks provider loading with a misleading "does not export a
CacheProvider instance" error.

**Handle interop defensively.** `keyv` v4 exports its constructor directly,
v5 exports it as `.default`, and `@keyv/redis` exposes only `.default` from its
CJS build. Which one you get depends on what won the hoist in the host
application, so accept either:

```ts
const keyvModule = require('keyv');
const Keyv = keyvModule.default ?? keyvModule;
```

## Package shape

The entry point must export:

```ts
module.exports = {
  provider: 'myprovider',
  name: 'My Provider',
  async init(options, { strapi }) {
    return MyCacheProvider.create(options);
  },
};
```

The plugin resolves `@strapi-community/provider-rest-cache-<name>` from the
provider `name` in configuration. Arbitrary npm packages are not yet supported
(there is a `@TODO` in `bootstrap.ts`).

## Cluster safety

If the backing store is distributed, a multi-key delete may span shards. Redis
Cluster rejects it outright:

```
CROSSSLOT Keys in request don't hash to the same slot
```

The redis provider deletes key by key when `store.redis.isCluster`, and batches
only the tracking-set update, which is a single key. Do the equivalent.

## Verifying

```bash
pnpm --filter @strapi-community/provider-rest-cache-<name> run build
pnpm run test:smoke     # loads the built provider and exercises it
pnpm run test:deps      # every import must be declared
pnpm run test:e2e:redis # if your provider is redis-shaped
pnpm run test:cluster   # cluster-safety check, needs the built dist
```

Then run the full memory suite too — the plugin's behaviour is provider-agnostic
and regressions show up there.

## Documenting it

A new provider needs a page under `docs/guide/providers/`, an entry in the
sidebar (`docs/.vitepress/config.js`), and a row in
`docs/guide/providers/index.md`. Follow the existing pages: every config sample
carries both JavaScript and TypeScript tabs.
