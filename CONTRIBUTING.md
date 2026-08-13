# Contributing

Thanks for taking the time. This document covers how the repository is laid out,
how to run it locally, what the test suites actually cover, and the handful of
things that have caught people out before.

## Repository layout

This is a pnpm workspace monorepo (`pnpm-workspace.yaml` globs `packages/*` and
`playgrounds/*`).

| Path | What it is |
| --- | --- |
| `packages/plugin-rest-cache` | The plugin. `server/` (Koa middleware, services, routes) and `admin/` (React admin panel), both TypeScript. Published as `@strapi-community/plugin-rest-cache`. |
| `packages/provider-rest-cache-memory` | In-memory provider. A dependency of the plugin, so it always ships. |
| `packages/provider-rest-cache-redis` | Redis provider. Optional; requires `@strapi-community/plugin-redis`. |
| `playgrounds/memory` | A real Strapi 5 app configured with the memory provider. Used as the host for the jest and Playwright suites. |
| `playgrounds/redis` | The same app configured with the redis provider. |
| `shared/` | The parts of the playground apps that are identical between them: `shared/src`, `shared/config`, and `shared/tests` (the jest e2e specs). |
| `e2e/` | Playwright browser tests that drive the memory playground's admin panel. |
| `docs/` | VitePress documentation site, published to GitHub Pages. |
| `scripts/` | Custom verification scripts that run in CI. |

### `shared/` is copied into the playgrounds — this surprises people

The root `postinstall` script copies the whole of `shared/` into **both**
playgrounds, wiping their `tests/*.test.js` first:

```jsonc
"postinstall:memory": "rimraf playgrounds/memory/tests/*.test.js && cpy . ../playgrounds/memory/ --cwd=shared"
```

Consequences:

- `playgrounds/*/tests/`, `playgrounds/*/src/` and most of `playgrounds/*/config/`
  are **generated** and untracked in git. Editing them works until the next
  `pnpm install`, then your change is gone.
- Edit `shared/tests/*.test.js`, `shared/src/**` and `shared/config/**` instead,
  then re-run `pnpm run postinstall:memory` (or `:redis`, or plain `pnpm install`)
  to propagate.
- The genuinely per-playground file is `playgrounds/<name>/config/plugins.js` —
  that one is tracked, and it is where the memory vs redis provider difference
  lives. `shared/config/cache-strategy.js` holds the strategy both share.

Run `git ls-files playgrounds/memory` if you are unsure whether a file is real or
generated: only 12 files are tracked.

## Prerequisites

- **Node.** The published plugin supports `>=20.0.0 <=26.x.x`. The **monorepo
  itself** needs `>=22.13.0` (root `package.json` `engines`), because Strapi
  5.52.0 pulls in `preferred-pm@5.0.0` which will not install below that. There
  is an `.nvmrc` pinning `v22.18.0`; `nvm use` is the shortest path.
- **pnpm** — the version in `packageManager` (currently `pnpm@10.33.0`).
  `corepack enable` will pick it up.
- **Redis** on `127.0.0.1:6379` if you want to touch the redis playground or run
  `test:e2e:redis`. Host and port are overridable with `REDIS_HOST` / `REDIS_PORT`.
- **Chromium for Playwright**, only if you are running the admin panel tests
  (see below).

## Getting started

```bash
git clone https://github.com/strapi-community/plugin-rest-cache.git
cd plugin-rest-cache
pnpm install
pnpm run build:plugin:rest-cache
```

`pnpm install` runs the `postinstall` copy described above. The build is not
optional: the playgrounds consume `@strapi-community/plugin-rest-cache` through a
workspace link and resolve it via its `exports` map, which points at `dist/`. An
unbuilt plugin means the playground boots without it.

Then boot a playground:

```bash
pnpm run dev:memory   # strapi develop, memory provider
pnpm run dev:redis    # strapi develop, redis provider (needs Redis running)
```

An interactive Strapi console against either app:

```bash
pnpm run console:memory
pnpm run console:redis
```

## The build / watch loop

The playgrounds pick up `packages/plugin-rest-cache/dist`, not its source. So
after every change to the plugin you either rebuild or run a watcher:

```bash
pnpm run build:plugin:rest-cache        # one-off build
pnpm run watch:plugin:rest-cache        # rebuild on change
pnpm run watch:link:plugin:rest-cache   # rebuild and keep a linked consumer in sync
```

`pnpm run verify:plugin:rest-cache` runs `strapi-plugin verify`, which checks the
package is shaped correctly for publishing (exports map, declaration files, and
so on). Worth running before opening a PR that touches the package manifest.

## Testing

Nothing here needs a network connection except the redis suite (localhost Redis)
and the Playwright browser download.

### `pnpm run test:e2e:memory` / `pnpm run test:e2e:redis`

Jest, run from inside the playground. Each spec boots Strapi in-process
(`shared/tests/helpers/strapi.js`) and drives the HTTP API with supertest. This is
the main functional suite and where most new coverage belongs. Roughly what is
covered today, from `shared/tests/`:

- caching behaviour: `cache-ttl`, `cache-key-config`, `keys-prefix`,
  `keys-prefix-collision`, `single-type-default`, `uncacheable-responses`,
  `request-coalescing`
- invalidation: `document-service-purge`, `collection-type-admin-purge`,
  `content-api-purge`, `purge-scalability`, `mcp-purge`
- strategy flags: `flag-etag`, `flag-x-cache-headers`, `flag-clear-related-cache`,
  `flag-document-service-middleware`
- admin surface: `admin-api`, `cache-stats`
- regressions: `custom-fields`, `content-type-api-name-mismatch`,
  `authenticated-caching`

`pnpm run test:e2e` runs both. The redis suite gives each jest worker its own
Redis logical database (`JEST_WORKER_ID % 16`), because cache keys are derived
from request paths and are identical across workers.

### `pnpm run test:admin`

Playwright. Boots the memory playground with `strapi build && strapi start` (not
`develop` — see the gotcha below), logs in once in `e2e/global-setup.ts`, and
drives the admin panel in Chromium. Install the browser first:

```bash
pnpm exec playwright install chromium
pnpm run test:admin
pnpm run test:admin:ui   # same suite, Playwright UI mode
```

A cold admin build takes minutes; the config allows 15. `reuseExistingServer` is
on outside CI, so leaving a playground running on port 1337 will be reused.
Specs live in `e2e/tests/`: the panel mounts at all, the settings dashboard shows
and refreshes live figures, the homepage widget renders, and the content-manager
contributions appear.

### `pnpm run test:lint`

Runs `test:deps` and then `pnpm -r run test:lint` across the workspace. For the
plugin that means `tsc --noEmit` against **both** `server/tsconfig.json` and
`admin/tsconfig.json`; for the providers, eslint plus a prettier `--check`. Run
this before pushing — it is the fastest of the CI jobs to reproduce.

### `pnpm run test:deps`

`scripts/check-undeclared-deps.cjs`. Fails if a published package imports a module
it does not declare in its own `dependencies`. Hoisted node_modules make an
undeclared import resolve fine here and in most user apps, right up until it
doesn't — that was issue #128, where the providers used `keyv` without declaring
it.

### `pnpm run test:esm`

`scripts/check-esm-bundle.cjs`. The plugin is a dual package: `require` resolves
`dist/server/index.js`, `import` resolves `dist/server/index.mjs`. Rollup leaves
`require`, `require.resolve`, `__dirname` and `__filename` alone when emitting
ESM, so any of them surviving into the `.mjs` is a `ReferenceError` for anyone
whose runtime takes the `import` branch. Needs a build first.

### `pnpm run test:smoke`

`scripts/provider-smoke.cjs`. Exercises the providers **without** booting Strapi,
so it can run on Node versions Strapi itself refuses to install on. CI runs it on
Node 20, 22 and 24 for exactly that reason.

### `pnpm run test:cluster`

`scripts/redis-cluster-check.cjs`. Asserts the redis provider never issues a
command that Redis Cluster would reject with `CROSSSLOT`. Cache keys derive from
request paths and therefore spread across hash slots by construction, so a batched
`UNLINK` or a `MULTI` spanning them fails on a cluster. Needs a build first; needs
no Redis (it uses a recording fake client).

## Gotchas

### The admin panel behaves differently under `develop` and `build`

This one has bitten the project hard enough to be worth stating plainly.

A plugin ships as a prebuilt ES module that imports `@strapi/strapi/admin` as an
external. Under `strapi develop`, Vite dedupes that import to the host's copy, so
everything reached through it — the redux store, the RTK `adminApi`, the `Auth`
context — is the same instance the host uses. Under `strapi build`, it is not: the
plugin chunk gets its own copy of that module graph.

What follows, all of it invisible under `strapi develop`:

- Endpoints injected into "our" `adminApi` are absent from the store's reducer, so
  the first response kills RTK with `Cannot read properties of undefined (reading
  'merge')`.
- `Page.Protect` reads an `Auth` context that is not there, and renders "You don't
  have the permissions to access that content" to a super admin.
- `useRBAC` throws "`useRBAC` must be used within `Auth`".

So, in plugin admin code:

- **Do not** use the admin's RTK `adminApi`, `useRBAC`, or `Page.Protect`.
- **Do** use `useFetchClient`, which shares nothing but a function. See
  `packages/plugin-rest-cache/admin/src/services/restCache.ts` for the pattern,
  including how deduplication and invalidation are done in a module-level cache.
- **Do** derive permissions from API responses — a 403 from the stats endpoint is
  what "no access" means. This is not weaker than a UI gate: every admin route
  already carries an `admin::hasPermissions` policy for the same action.
- Related: `unstable_useContentManagerContext` is only valid inside the edit view,
  but Strapi evaluates registered document actions on the list view too. Read the
  context from the props the content-manager passes instead.

**Anything admin-facing must be verified with `pnpm run test:admin`.** A green
`strapi develop` proves nothing about a production build, and the jest suites never
render anything at all.

### `maxAge` and `ttl` are milliseconds. Everywhere.

The plugin's `maxAge`, the route and content-type `maxAge`, the value handed to a
provider, and `cache-manager`'s `ttl` are all milliseconds. Converting again is
what turned a configured hour into 41.7 days (issue #126). There is a
`Milliseconds` branded type in `server/src/types/common.ts` so the compiler
rejects the mistake. Do not "fix" a unit you think looks wrong without reading
that file first.

## Conventions

- **TypeScript for both halves of the plugin.** `server/` and `admin/` are both TS
  and both typechecked in CI. The providers are still JavaScript with eslint and
  prettier.
- **Comments explain why, not what.** The house style is on display in
  `packages/plugin-rest-cache/server/src/types/common.ts`: each branded type
  carries the bug it exists to prevent, with a link to the issue. Follow that —
  when you fix something subtle, leave behind the reason the code is shaped that
  way, not a restatement of the code.
- **Tests before fixes.** Reproduce the bug in `shared/tests/` (or `e2e/tests/`
  for anything the browser can see), watch it fail, then fix it. Several of the
  existing specs are named after the issue they guard.
- Prettier runs on staged `packages/**` and `playgrounds/**` `.ts`/`.js` files and
  on `docs/**/*.md` via lint-staged.

## Commits and pull requests

- Branch from `main`. Long-running work can live on `dev/**`, which CI also builds.
- **Conventional commits.** Check `git log --oneline -20` for the tone actually
  used here — the scope is optional and the subject is a sentence, not a label:

  ```text
  feat: support caching authenticated requests
  fix: make redis purges safe on a cluster
  fix(admin): make the panel work in a production build, and test it (#184)
  refactor(plugin): rewrite the server in TypeScript (#179)
  test: guard the custom field plugin ordering from #119
  ci: stop dependabot offering majors we cannot take
  perf: batch cache purges instead of one round trip per key
  docs: sync README with the published 5.0.1 and backfill changelogs
  ```

  PR bodies in this repo tend to be long and explain the failure mode. That is
  the expectation, not an accident.
- **CI must be green.** `.github/workflows/tests.yml` runs on pushes to `main` and
  `dev/**`, and on PRs to `main`:

  | Job | What it does |
  | --- | --- |
  | `provider_smoke` | Builds the plugin, runs `test:esm` and `test:cluster`, then runs `scripts/provider-smoke.cjs` on Node 20, 22 and 24. |
  | `linters` | `pnpm run test:lint` on Node 22, 24 and 26. |
  | `e2e_memory` | Jest e2e against the memory playground, Node 22, 24, 26. |
  | `e2e_redis` | Jest e2e against the redis playground with a Redis service container, Node 22, 24, 26. |
  | `e2e_admin` | Playwright against a production admin build, Node 22 only. Uploads `e2e/.output/` on failure. |

  `.github/workflows/docs.yml` publishes the VitePress site; `benchmarks.yml` is
  run manually.
- If your change is user-visible, update `docs/guide/` in the same PR. Preview it
  with `pnpm run docs:dev`.

## Adding a cache provider

Providers implement the `CacheProvider` abstract class in
`packages/plugin-rest-cache/server/src/types/CacheProvider.ts`. Read it first —
the contract is small but the comments record what previously went wrong:

- `get`, `set`, `del`, `keys` and the `ready` getter are required.
- `delMany` and `clear` have working base-class defaults, so a provider written
  against the older contract keeps working. Override them if your store has batch
  operations; a purge is otherwise one round trip per key.
- `keys(keysPrefix?)` must return keys **without** the store's configured
  `keysPrefix` and without any adapter-internal qualification. `@keyv/redis`
  tracks keys as fully qualified redis keys (`keyv:/api/foo`), and returning that
  form meant purge regexes matched nothing (issue #131).
- `set`'s `maxAge` is milliseconds. Pass it through unchanged.

`packages/provider-rest-cache-memory` and `packages/provider-rest-cache-redis` are
the two reference implementations. The user-facing write-up is at
[docs/guide/providers/custom.md](./docs/guide/providers/custom.md).

If you add a provider to this repo, add it to `scripts/provider-smoke.cjs` so it
is exercised on every supported Node version without Strapi in the way.

## Getting help

Open an [issue](https://github.com/strapi-community/plugin-rest-cache/issues). If
it is a bug, a failing spec added to `shared/tests/` is the most useful thing you
can attach.
