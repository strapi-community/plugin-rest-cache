# What changed and why

<!-- What the change does, and the failure mode or need behind it. PR bodies here tend
     to be long and explain the failure mode — that is the expectation, not an accident. -->

Closes #

## Checklist

- [ ] Tests added or updated. For a bug fix: a spec in `shared/tests/` that fails before the change. Browser-visible behaviour goes in `e2e/tests/`.
- [ ] `pnpm run test:e2e:memory` passes.
- [ ] `pnpm run test:lint` passes (`tsc --noEmit` over `server/` and `admin/`, plus eslint and prettier on the providers).
- [ ] Touches `admin/`? `pnpm run test:admin` was run and passes. **A green `strapi develop` proves nothing** — under a production build the plugin chunk gets its own copy of `@strapi/strapi/admin`, so the store, `adminApi`, `Auth` and `useRBAC` are not the host's. See the gotcha in [CONTRIBUTING.md](../CONTRIBUTING.md).
- [ ] Touches a provider or the published package shape? `pnpm run test:e2e:redis`, `pnpm run test:smoke`, `pnpm run test:esm`, `pnpm run test:cluster` and `pnpm run verify:plugin:rest-cache` as relevant.
- [ ] Any duration I touched is **milliseconds** — `maxAge`, route/content-type `maxAge`, the provider `ttl`. No new conversion. (#126)
- [ ] User-visible change? `docs/guide/` updated in this PR.
- [ ] Conventional commit subjects, branched from `main`.

## Notes for the reviewer

<!-- Anything not obvious from the diff: what you could not test, a trade-off you took,
     a follow-up you are deliberately leaving out. -->
