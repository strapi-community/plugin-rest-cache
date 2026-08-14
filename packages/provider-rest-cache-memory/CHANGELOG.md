# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## Unreleased

### Fixed

* **ttl:** `maxAge` is milliseconds and was being multiplied by 1000 again
  before being handed to cache-manager, whose `set()` also takes milliseconds.
  The default hour became 41.7 days, so entries effectively never expired
  ([#126](https://github.com/strapi-community/plugin-rest-cache/issues/126))
* **deps:** `keyv` is now a declared dependency instead of arriving only via
  hoisting, and is resolved tolerantly (`mod.default ?? mod`) so a keyv v4
  hoisted by another package no longer causes "Keyv is not a constructor"
  ([#128](https://github.com/strapi-community/plugin-rest-cache/issues/128))
* **esm:** `quick-lru` v7 is ESM-only and was `require()`d from CommonJS, which
  fails on any Node without `require(esm)` (added in 20.19) with
  `ERR_REQUIRE_ESM`. It is now loaded with a dynamic `import()`, which works on
  every supported Node version. Note downgrading to `quick-lru` v5 is not a
  valid workaround: it lacks the iterator `keys()` depends on, which would
  silently break all cache invalidation ([#128](https://github.com/strapi-community/plugin-rest-cache/issues/128))

### Added

* `engines.node` (`>=20.0.0`) is declared, so an unsupported Node fails at
  install rather than mysteriously at boot

## [5.1.0](https://github.com/strapi-community/plugin-rest-cache/compare/provider-rest-cache-memory-v5.0.0...provider-rest-cache-memory-v5.1.0) (2026-08-14)


### Bug Fixes

* correct 1000x cache TTL inflation and purge on all admin write routes ([5dc7a20](https://github.com/strapi-community/plugin-rest-cache/commit/5dc7a20cf6a7dec6c8c5d9d8f62f2c4adf190c4b))
* correct 1000x cache TTL inflation and purge on all admin write routes ([8197205](https://github.com/strapi-community/plugin-rest-cache/commit/8197205cce4abf1fc1b3b982186b9ddbaee2e85b))
* load providers reliably across Node versions and module shapes ([ce7215a](https://github.com/strapi-community/plugin-rest-cache/commit/ce7215a13c99a3e150e7ebbab672edc849948859))
* load providers reliably across Node versions and module shapes ([c403830](https://github.com/strapi-community/plugin-rest-cache/commit/c40383015846e4a80525f5aded07a741381541d3))


### Performance

* batch cache purges instead of one round trip per key ([2574d82](https://github.com/strapi-community/plugin-rest-cache/commit/2574d82d027241352cc2007cd5d32acfb084a3cf))
* batch cache purges instead of one round trip per key ([face64d](https://github.com/strapi-community/plugin-rest-cache/commit/face64d8565a59938dbacb983b669077c71b3d8c))


### Refactoring

* **providers:** convert both provider packages to TypeScript ([#188](https://github.com/strapi-community/plugin-rest-cache/issues/188)) ([c46540f](https://github.com/strapi-community/plugin-rest-cache/commit/c46540f6e8a599b92af948ff25075c8104ce1937))


### Documentation

* give every published package a README ([#196](https://github.com/strapi-community/plugin-rest-cache/issues/196)) ([2f53e09](https://github.com/strapi-community/plugin-rest-cache/commit/2f53e0968eb4e151da0d89c949504568528ec1b1))
* sync README with the published 5.0.1 and backfill changelogs ([380997c](https://github.com/strapi-community/plugin-rest-cache/commit/380997cad55e10db1e57e22ac31270cd17f534df))
* sync README with the published 5.0.1 and backfill changelogs ([9878fbb](https://github.com/strapi-community/plugin-rest-cache/commit/9878fbb788335a68339344d2adeb9793c45deec8))

## [4.2.4](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.2.3...v4.2.4) (2022-03-19)

**Note:** Version bump only for package strapi-provider-rest-cache-memory





## [4.2.3](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.2.2...v4.2.3) (2022-03-18)

**Note:** Version bump only for package strapi-provider-rest-cache-memory





## [4.2.2](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.2.1...v4.2.2) (2022-03-15)

**Note:** Version bump only for package strapi-provider-rest-cache-memory





## [4.2.1](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.2.0...v4.2.1) (2022-03-11)


### Bug Fixes

* empty keys returned by providers ([fb5c79c](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/fb5c79c490309e8bd4458726fe8aedacbfae503b))





# [4.2.0](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.1.0...v4.2.0) (2022-03-09)

**Note:** Version bump only for package strapi-provider-rest-cache-memory





# [4.1.0](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.6...v4.1.0) (2022-03-05)

**Note:** Version bump only for package strapi-provider-rest-cache-memory





## [4.0.6](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.5...v4.0.6) (2022-03-02)

**Note:** Version bump only for package strapi-provider-rest-cache-memory

## [4.0.5](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.4...v4.0.5) (2022-03-02)

**Note:** Version bump only for package strapi-provider-rest-cache-memory

## [4.0.4](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.3...v4.0.4) (2022-02-26)

**Note:** Version bump only for package strapi-provider-rest-cache-memory

## [4.0.3](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.2...v4.0.3) (2022-02-26)

**Note:** Version bump only for package strapi-provider-rest-cache-memory

## [4.0.2](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.1...v4.0.2) (2022-02-24)

### Bug Fixes

- use short plugin name ([8daf416](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/8daf41643c2479c0df19a2fe137cae7ec395ec78))

## [4.0.1](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.0...v4.0.1) (2022-02-24)

### Bug Fixes

- empty npm packages ([1fde26a](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/1fde26a1da956c854661b036bc48483c49f9f75e))

# [4.0.0](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.0-alpha.1...v4.0.0) (2022-01-31)

### Bug Fixes

- peerDependencies fixed version ([4b5e317](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/4b5e317ae9319a91f90d7d7fb62fbcb7401d67af))

### Features

- **core:** add keysPrefix strategy option ([8ed2149](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/8ed21495fadd2d2d709c741c3bccdc48d17376bd))

# [4.0.0-alpha.1](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.0-alpha.0...v4.0.0-alpha.1) (2022-01-31)

### Bug Fixes

- peerDependencies fixed version ([f43ef96](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/f43ef96b87c274618ecd041b733ecfa22c824c74))

# [4.0.0-alpha.0](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v1.0.1-alpha.0...v4.0.0-alpha.0) (2022-01-31)

**Note:** Version bump only for package strapi-provider-rest-cache-memory
