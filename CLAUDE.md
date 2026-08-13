# CLAUDE.md

Guidance for Claude Code working in this repository.

`CONTRIBUTING.md` is the human-facing version and is more complete on setup.
This file is the short version plus the things that have actually cost people
time here.

## What this is

`@strapi-community/plugin-rest-cache` — a Strapi 5 plugin that caches REST API
responses and invalidates them when content changes. A pnpm workspace monorepo.

| Path | What it is |
| --- | --- |
| `packages/plugin-rest-cache` | The plugin. `server/` and `admin/`, both TypeScript. |
| `packages/provider-rest-cache-*` | Cache backends (memory, redis). Published separately. |
| `playgrounds/{memory,redis}` | Real Strapi apps used as test hosts. |
| `shared/tests` | Jest e2e specs, **copied into both playgrounds** by `postinstall`. |
| `e2e/` | Playwright browser tests for the admin panel. |
| `docs/` | VitePress site. `docs:build` regenerates the TypeDoc API reference first. |
| `scripts/` | Custom CI checks — read these before adding a new one. |

Edit specs in `shared/tests/`, never in `playgrounds/*/tests/` — those are
copies and will be overwritten.

## Things that will bite you

**Every duration is milliseconds.** `maxAge`, `ttl`, everywhere. A past bug
converted them twice, so a configured hour lived 41.7 days. Never add a
conversion. `server/src/types/common.ts` brands the type to make the mistake a
compile error; read that file — its comments are the house style for explaining
*why*.

**The admin panel behaves differently under `strapi develop` and
`strapi build`.** In dev, Vite dedupes `@strapi/strapi/admin` to the host's
copy. In a production build, the plugin chunk gets its own copy of that module
graph. Consequences, all of which shipped once:

- do **not** use the admin's RTK `adminApi` from plugin code — endpoints
  injected into "our" copy are absent from the store's reducer, and the first
  response kills it with `Cannot read properties of undefined (reading 'merge')`;
- do **not** use `useRBAC` or `Page.Protect` — the Auth context is unreachable
  and `useRBAC` throws;
- use `useFetchClient`, and derive permissions from API responses (a 403 is the
  answer). The server enforces permissions on every route regardless.

Verifying an admin change in `strapi develop` proves nothing. Run
`pnpm run test:admin`.

**Content-manager contributions are evaluated on the list view too.** Document
actions and side panels must not call `unstable_useContentManagerContext` —
it throws outside the edit view and takes the whole list down. Use the props
the content-manager passes.

**Providers must stay CommonJS.** They are loaded with
`createRequire(...)(modulePath)`. `quick-lru` v7 and `chalk` v5 are ESM-only,
which is why the memory provider resolves its dependency through an async
`create()`. Do not "modernise" this.

**Provider classes are identified by name.** `bootstrap.ts` walks the
constructor chain comparing `constructor.name`, because a provider package
resolves its own copy of the types bundle so a real `instanceof` is false.
Renaming `MemoryCacheProvider` or `RedisCacheProvider` breaks provider loading.

**The default `hitpass` bypasses anything with an `authorization` or `cookie`
header.** In tests this means a request made with an authenticated context
caches nothing. Warm the cache from a cookie-less client — `e2e/helpers.ts`
does this deliberately.

## Verifying

A typecheck is not verification. Neither is a passing build.

```bash
pnpm run build:plugin:rest-cache   # required before the playgrounds see changes
pnpm run test:e2e:memory           # jest, boots Strapi in-process
pnpm run test:e2e:redis            # needs a local redis
pnpm run test:admin                # playwright, builds the admin and drives it
pnpm run test:lint                 # typechecks server AND admin
pnpm run test:deps                 # imports must be declared dependencies
pnpm run test:esm                  # the .mjs bundle must have no CJS globals
```

`test:admin` needs `pnpm exec playwright install chromium` once.

When a test is meant to catch a specific failure, **make it fail on purpose
once**. A test that has never been seen red is not evidence. Several bugs here
were found only because a supposedly-passing test was checked that way — and
one test passed for the wrong reason until it was.

## Conventions

- TypeScript on both halves. Named exports; keep export shapes stable, Strapi
  reads several of them by convention.
- Comments explain **why**, not what — ideally citing the issue whose bug the
  code prevents. Do not delete such comments while refactoring.
- Conventional commits. Commit messages describe the reasoning, not a diff
  summary.
- Never convert a duration. Never widen a permission to make a test pass.

## Release

Publishing is **manual, always**. There is no automated release on merge, by
deliberate policy. See `.claude/skills/` for the release procedure.
