---
name: verify-a-change
description: Verify a change to this plugin before opening a PR. Use after modifying anything under packages/, especially admin code, providers, or cache behaviour, and before claiming that something works.
---

# Verifying a change

A typecheck is not verification. A passing build is not verification. This
repository has shipped code that compiled, built, passed every test, and was
completely broken in production.

## Always

```bash
pnpm run build:plugin:rest-cache   # playgrounds resolve the built dist, not src
pnpm run test:lint                 # typechecks server AND admin
pnpm run test:e2e:memory           # 116 specs, boots Strapi in-process
```

`build:plugin:rest-cache` first, every time. The playgrounds consume `dist/`,
so an unbuilt change is invisible to every test below it and you will debug a
stale artifact.

## If you touched `admin/`

```bash
pnpm run test:admin
```

Non-negotiable. The admin panel behaves **differently** under `strapi develop`
than under `strapi build`: in dev, Vite dedupes `@strapi/strapi/admin` to the
host's copy; in a production build the plugin chunk gets its own copy of that
module graph. A change verified only in `strapi develop` has not been verified.

Symptoms this catches, all of which have happened here: the dashboard hanging
on its loading state, `Page.Protect` refusing a super admin, `useRBAC` throwing
`must be used within Auth`, and the content-manager list view dying outright.

First run needs `pnpm exec playwright install chromium`.

## If you touched a provider or package shape

```bash
pnpm run test:deps    # every import must be a declared dependency
pnpm run test:esm     # the .mjs bundle must contain no CommonJS-only globals
pnpm run test:smoke   # loads the built providers and exercises them
```

`test:esm` exists because `require.resolve` once survived into the ESM bundle,
where `require` does not exist, and the plugin failed to boot for anyone whose
runtime took the `import` branch of the exports map. The e2e suite could not
see it — it loads the CommonJS entry.

## If you touched caching or invalidation behaviour

Run the redis suite too. It exercises code paths the memory provider does not
have — cluster-safe deletes, the key-tracking set, prefix handling:

```bash
pnpm run test:e2e:redis    # needs a local redis on 6379
```

## Prove the test can fail

If you added a test for a specific bug, break the fix on purpose and confirm
the test goes red, then restore it. A test that has never been seen red is not
evidence that it checks anything.

Two real examples from this repo:

- a coalescing test passed before the feature existed, because in-memory
  responses were too fast to overlap — it needed artificial origin latency to
  become a real test;
- a cache-warming step in a browser test silently cached nothing, because it
  used a client that sent the admin session cookie and the default `hitpass`
  declined to cache it.

## Before claiming it works

State what you actually ran. If you verified an admin change in
`strapi develop` only, say that, and say it is not sufficient.
