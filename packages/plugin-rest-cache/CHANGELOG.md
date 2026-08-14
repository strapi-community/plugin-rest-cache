# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## Unreleased

### Fixed

* **ttl:** cache entries expired 1000x later than configured. `maxAge` is
  milliseconds throughout the plugin, but both providers multiplied it by 1000
  again before handing it to cache-manager, whose `set()` also takes
  milliseconds - the default hour became 41.7 days, so entries effectively
  never expired ([#126](https://github.com/strapi-community/plugin-rest-cache/issues/126))
* **purge:** admin bulk publish, bulk unpublish, discard, clone and auto-clone
  left the cache stale. Seven content-manager write routes were missing from
  the hardcoded route list ([#127](https://github.com/strapi-community/plugin-rest-cache/issues/127))
* **provider:** "Could not load REST Cache provider" and "Keyv is not a
  constructor" on startup. `keyv` was undeclared and reached the providers only
  via hoisting, and the ESM-only `quick-lru` was `require()`d from CommonJS,
  which fails below Node 20.19. The underlying error is no longer replaced with
  a misleading "you may need to install a provider" message
  ([#128](https://github.com/strapi-community/plugin-rest-cache/issues/128), [#118](https://github.com/strapi-community/plugin-rest-cache/issues/118),
  [#123](https://github.com/strapi-community/plugin-rest-cache/issues/123), [#116](https://github.com/strapi-community/plugin-rest-cache/issues/116))
* **config:** a content type whose name differs from its parent API - such as
  `api::writer.editor` - crashed the whole application at register time with
  "Cannot read properties of undefined (reading 'routes')". The owning API is
  now resolved from the uid ([#125](https://github.com/strapi-community/plugin-rest-cache/issues/125))
* **routes:** custom routes ending in a repeatable param, such as
  `/categories/slug/:slug+`, were silently never cached. The trailing `+` was
  stripped from the configured path but not the registered one, so they could
  never match
* **purge:** the purge is awaited again, so a client that writes and
  immediately reads sees fresh content. Deferring it to `onCommit` made it
  fire-and-forget, because Strapi runs commit callbacks without awaiting them

### Added

* **invalidation:** cache invalidation now runs off the document service
  (`strapi.documents.use()`) rather than injected route middleware. Writes that
  never traverse an HTTP route - GraphQL mutations, scheduled Content Releases,
  review-workflow transitions, custom `strapi.documents()` calls in services,
  cron jobs or seed scripts - now invalidate correctly. Controlled by the new
  `strategy.enableDocumentServiceMiddleware` option, default `true`; set it to
  `false` for the previous route-based behaviour
  ([#129](https://github.com/strapi-community/plugin-rest-cache/issues/129))
* **packaging:** `engines.node` (`>=20.0.0`) is declared on the plugin and both
  providers, so an unsupported Node fails at install rather than at boot

### Changed

* **BREAKING (behaviour):** because TTLs are now honoured, cached entries
  expire when configured instead of lasting roughly 41 days. Expect a higher
  miss rate and more origin traffic after upgrading. If `maxAge` or the
  provider `ttl` was tuned around the previous behaviour, revisit it
* when `enableDocumentServiceMiddleware` is enabled (the default), the route
  `purge` and `purgeAdmin` middlewares are no longer injected, since the
  document service already covers every write

## [5.1.0](https://github.com/strapi-community/plugin-rest-cache/compare/plugin-rest-cache-v5.0.1...plugin-rest-cache-v5.1.0) (2026-08-14)


### Features

* add a cache statistics endpoint for the admin dashboard ([594ba4a](https://github.com/strapi-community/plugin-rest-cache/commit/594ba4a77240803997eed8ee75656529cdeb3606))
* add a cache statistics endpoint for the admin dashboard ([56aeae4](https://github.com/strapi-community/plugin-rest-cache/commit/56aeae42ec316c9c604f43626e6286f114b634fc))
* add an opt-in content API purge endpoint ([59d1153](https://github.com/strapi-community/plugin-rest-cache/commit/59d1153c1ac85f6073624920dc5deced883f757f))
* add an opt-in content API purge endpoint ([ed4f778](https://github.com/strapi-community/plugin-rest-cache/commit/ed4f778f71776cf2d5fe258af14997339623e528))
* **admin:** rewrite the admin panel in TypeScript and add a dashboard ([#181](https://github.com/strapi-community/plugin-rest-cache/issues/181)) ([4db948f](https://github.com/strapi-community/plugin-rest-cache/commit/4db948fb1012be618a2bd647007db4aed5b8f0fc))
* document service invalidation, custom route fix, and content type/API name mismatch fix ([a6a289a](https://github.com/strapi-community/plugin-rest-cache/commit/a6a289a044035158829d36e0edc0de43fd3e5afd))
* emit Cache-Control headers on cached responses ([#201](https://github.com/strapi-community/plugin-rest-cache/issues/201)) ([ee75158](https://github.com/strapi-community/plugin-rest-cache/commit/ee7515812dc0b64e615df3a98627126cfb674e31))
* invalidate cache from the document service ([2a6903a](https://github.com/strapi-community/plugin-rest-cache/commit/2a6903a8dfbbcb7db8b02b8d1412688cea4ccf02))
* support caching authenticated requests ([23f84a4](https://github.com/strapi-community/plugin-rest-cache/commit/23f84a4dc1aafc384ab13dbdb2bc9833ff0683cb))
* support caching authenticated requests ([155af0a](https://github.com/strapi-community/plugin-rest-cache/commit/155af0a2a420495345c9f9a212fa40c611ccfa72))


### Bug Fixes

* **admin:** make the panel work in a production build, and test it ([#184](https://github.com/strapi-community/plugin-rest-cache/issues/184)) ([5c0a229](https://github.com/strapi-community/plugin-rest-cache/commit/5c0a229485e8bf21c63fff8f88536d0ee05fc966))
* await the cache purge instead of deferring it to onCommit ([9675095](https://github.com/strapi-community/plugin-rest-cache/commit/96750957feaffd5ac5152a26e37c5dbc1e58e6e4))
* cache custom routes whose path ends in a repeatable param ([b38d827](https://github.com/strapi-community/plugin-rest-cache/commit/b38d827955252f5d9f6ec57fcb3987c4ab70cd98))
* coalesce concurrent cache misses and stop racing the purge ([52b0b44](https://github.com/strapi-community/plugin-rest-cache/commit/52b0b4454f0ac1c1b2f91f745d18357eb3fcad09))
* coalesce concurrent cache misses and stop racing the purge ([b51ee55](https://github.com/strapi-community/plugin-rest-cache/commit/b51ee55695e67a07062bb861f6c0f560d45b0958))
* correct 1000x cache TTL inflation and purge on all admin write routes ([5dc7a20](https://github.com/strapi-community/plugin-rest-cache/commit/5dc7a20cf6a7dec6c8c5d9d8f62f2c4adf190c4b))
* correct 1000x cache TTL inflation and purge on all admin write routes ([8197205](https://github.com/strapi-community/plugin-rest-cache/commit/8197205cce4abf1fc1b3b982186b9ddbaee2e85b))
* load providers reliably across Node versions and module shapes ([ce7215a](https://github.com/strapi-community/plugin-rest-cache/commit/ce7215a13c99a3e150e7ebbab672edc849948859))
* load providers reliably across Node versions and module shapes ([c403830](https://github.com/strapi-community/plugin-rest-cache/commit/c40383015846e4a80525f5aded07a741381541d3))
* refuse to cache responses that cannot be safely replayed ([5ccde8a](https://github.com/strapi-community/plugin-rest-cache/commit/5ccde8a3cf83479a744f14e1e176aec2cb4b2ac8))
* refuse to cache responses that cannot be safely replayed ([714f8f0](https://github.com/strapi-community/plugin-rest-cache/commit/714f8f0834153f6ec9a48783b453079c9a16587c))
* resolve cache providers from the Strapi application root ([#197](https://github.com/strapi-community/plugin-rest-cache/issues/197)) ([691f3ff](https://github.com/strapi-community/plugin-rest-cache/commit/691f3ffef7711f91d6691d371d9e03ba0b1f8f0d))
* resolve default routes from the API in the uid, not the singular name ([552763b](https://github.com/strapi-community/plugin-rest-cache/commit/552763b8da9af71b4a14324ff37bb408347e0638))
* restore the lodash dependency and guard against undeclared imports ([566c841](https://github.com/strapi-community/plugin-rest-cache/commit/566c8410055d34f9e4b86ef03a50180675deb33a))


### Performance

* batch cache purges instead of one round trip per key ([2574d82](https://github.com/strapi-community/plugin-rest-cache/commit/2574d82d027241352cc2007cd5d32acfb084a3cf))
* batch cache purges instead of one round trip per key ([face64d](https://github.com/strapi-community/plugin-rest-cache/commit/face64d8565a59938dbacb983b669077c71b3d8c))


### Refactoring

* drop chalk for node:util styleText, and make bad benchmarks visible ([b1e9216](https://github.com/strapi-community/plugin-rest-cache/commit/b1e9216bc71498b54a5efa96cd9d29ca864656ca))
* drop chalk for node:util styleText, and make bad benchmarks visible ([e71f456](https://github.com/strapi-community/plugin-rest-cache/commit/e71f4562a37a4d1621b1b9158a522e0772722f52))
* **plugin:** rewrite the server in TypeScript ([#179](https://github.com/strapi-community/plugin-rest-cache/issues/179)) ([586e681](https://github.com/strapi-community/plugin-rest-cache/commit/586e681df4ad28254805af437a93cba403e8b19c))


### Documentation

* give every published package a README ([#196](https://github.com/strapi-community/plugin-rest-cache/issues/196)) ([2f53e09](https://github.com/strapi-community/plugin-rest-cache/commit/2f53e0968eb4e151da0d89c949504568528ec1b1))
* sync README with the published 5.0.1 and backfill changelogs ([380997c](https://github.com/strapi-community/plugin-rest-cache/commit/380997cad55e10db1e57e22ac31270cd17f534df))
* sync README with the published 5.0.1 and backfill changelogs ([9878fbb](https://github.com/strapi-community/plugin-rest-cache/commit/9878fbb788335a68339344d2adeb9793c45deec8))

## 5.0.1

### Changed

* documentation only; no functional change. The published `dist/` output is
  byte-for-byte identical to `5.0.0`

## 5.0.0

### Added

* Strapi 5 support ([#112](https://github.com/strapi-community/plugin-rest-cache/pull/112))

## [4.2.4](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.2.3...v4.2.4) (2022-03-19)


### Bug Fixes

* **perfs:** split keys computation into smaller functions ([5aba888](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/5aba8888cf132be241ef8a1ced7a83bfb1a626cb))





## [4.2.3](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.2.2...v4.2.3) (2022-03-18)


### Bug Fixes

* **etag:** send a 304 (Not Modified) when valid If-None-Match header contains multiple values ([ccf936a](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/ccf936a02fbbb04a13bcf8143dd6009a3d1148c5))
* **purge-rest-cache:** cannot purge with redis ([aa1da6d](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/aa1da6da1b2165cabf4de5894eb6179e02ebe633))





## [4.2.2](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.2.1...v4.2.2) (2022-03-15)


### Bug Fixes

* ensure keyprefix is not undefined ([9134f52](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/9134f52a0ea8a8399db4af59a5dc689742104739))





## [4.2.1](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.2.0...v4.2.1) (2022-03-11)


### Bug Fixes

* empty keys returned by providers ([fb5c79c](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/fb5c79c490309e8bd4458726fe8aedacbfae503b))





# [4.2.0](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.1.0...v4.2.0) (2022-03-09)


### Bug Fixes

* configuration header sort ([c0eec8f](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/c0eec8f475b3b25722fbb5de659212e25f263534))
* route checking should be absolute ([fdf8666](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/fdf866648a98036b8c70500769cf3bcac42671d8))


### Features

* expose new clearByUid and clearByRegexp functions in cacheStore service ([c7d67fd](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/c7d67fd532ccca66df90b3621061ba2d65b70fe1))





# [4.1.0](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.6...v4.1.0) (2022-03-05)


### Bug Fixes

* better path resolution when using custom delimiters ([943393d](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/943393d97fc36e0995884a05bacc9720a7f78fe1))


### Features

* add strategy debug option ([0dda260](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/0dda26065d17f5b884b224616ffe07c2b8fbcba8))





## [4.0.6](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.5...v4.0.6) (2022-03-02)

### Bug Fixes

- only use boostrap lifecycle to register the plugin ([46eaf0b](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/46eaf0bbf60f67c06cf1d8d0ad95f087f68a58b1))

## [4.0.5](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.4...v4.0.5) (2022-03-02)

### Bug Fixes

- pluginId used to register permissions actions ([3376b4a](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/3376b4a74a53e563d50f520cd02f72be0e6ee89d))

## [4.0.4](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.3...v4.0.4) (2022-02-26)

### Bug Fixes

- add missing server entrypoint ([820c967](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/820c967b414c29b19bf4ba483e15692ba613a4d6))
- ignore unexisting routes instead of throwing ([7f06c9d](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/7f06c9d9633d6a07b741f480352bac6ad86b6678))

## [4.0.3](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.2...v4.0.3) (2022-02-26)

### Bug Fixes

- use short plugin name ([7acc0e7](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/7acc0e790f9a2d060943e7d506a45a515ed0988c))

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

**Note:** Version bump only for package strapi-plugin-rest-cache

# [4.0.0-alpha.0](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v1.0.1-alpha.0...v4.0.0-alpha.0) (2022-01-31)

- feat(core)!: add keys alterations options ([a4214f2](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/a4214f2fb90259400c1c5a9701b83221ac2fa1bb))

### BREAKING CHANGES

- move headers to keys.useHeaders
  add keys.useQueryParams option
