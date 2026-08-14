# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [5.1.0-beta](https://github.com/strapi-community/plugin-rest-cache/compare/monorepo-v5.0.1...monorepo-v5.1.0-beta) (2026-08-14)


### Features

* add a cache statistics endpoint for the admin dashboard ([594ba4a](https://github.com/strapi-community/plugin-rest-cache/commit/594ba4a77240803997eed8ee75656529cdeb3606))
* add a cache statistics endpoint for the admin dashboard ([56aeae4](https://github.com/strapi-community/plugin-rest-cache/commit/56aeae42ec316c9c604f43626e6286f114b634fc))
* add an opt-in content API purge endpoint ([59d1153](https://github.com/strapi-community/plugin-rest-cache/commit/59d1153c1ac85f6073624920dc5deced883f757f))
* add an opt-in content API purge endpoint ([ed4f778](https://github.com/strapi-community/plugin-rest-cache/commit/ed4f778f71776cf2d5fe258af14997339623e528))
* **admin:** rewrite the admin panel in TypeScript and add a dashboard ([#181](https://github.com/strapi-community/plugin-rest-cache/issues/181)) ([4db948f](https://github.com/strapi-community/plugin-rest-cache/commit/4db948fb1012be618a2bd647007db4aed5b8f0fc))
* **bench:** measure conditional requests and unique-key workloads ([#194](https://github.com/strapi-community/plugin-rest-cache/issues/194)) ([b41201b](https://github.com/strapi-community/plugin-rest-cache/commit/b41201b578aafb6ac2077248ad469b516f5ad067))
* document service invalidation, custom route fix, and content type/API name mismatch fix ([a6a289a](https://github.com/strapi-community/plugin-rest-cache/commit/a6a289a044035158829d36e0edc0de43fd3e5afd))
* emit Cache-Control headers on cached responses ([#201](https://github.com/strapi-community/plugin-rest-cache/issues/201)) ([ee75158](https://github.com/strapi-community/plugin-rest-cache/commit/ee7515812dc0b64e615df3a98627126cfb674e31))
* invalidate cache from the document service ([2a6903a](https://github.com/strapi-community/plugin-rest-cache/commit/2a6903a8dfbbcb7db8b02b8d1412688cea4ccf02))
* support caching authenticated requests ([23f84a4](https://github.com/strapi-community/plugin-rest-cache/commit/23f84a4dc1aafc384ab13dbdb2bc9833ff0683cb))
* support caching authenticated requests ([155af0a](https://github.com/strapi-community/plugin-rest-cache/commit/155af0a2a420495345c9f9a212fa40c611ccfa72))


### Bug Fixes

* **admin:** make the panel work in a production build, and test it ([#184](https://github.com/strapi-community/plugin-rest-cache/issues/184)) ([5c0a229](https://github.com/strapi-community/plugin-rest-cache/commit/5c0a229485e8bf21c63fff8f88536d0ee05fc966))
* await the cache purge instead of deferring it to onCommit ([9675095](https://github.com/strapi-community/plugin-rest-cache/commit/96750957feaffd5ac5152a26e37c5dbc1e58e6e4))
* **bench:** combine the providers into one document, and run them in parallel ([#207](https://github.com/strapi-community/plugin-rest-cache/issues/207)) ([b470da6](https://github.com/strapi-community/plugin-rest-cache/commit/b470da675356573864b7f6c72ef9ee53b5f362cf))
* **bench:** isolate redis per scenario and stop counting 304s as failures ([#202](https://github.com/strapi-community/plugin-rest-cache/issues/202)) ([2e2b0ec](https://github.com/strapi-community/plugin-rest-cache/commit/2e2b0ec9f2df5371d884a8fea890542a51e5df5d))
* cache custom routes whose path ends in a repeatable param ([b38d827](https://github.com/strapi-community/plugin-rest-cache/commit/b38d827955252f5d9f6ec57fcb3987c4ab70cd98))
* coalesce concurrent cache misses and stop racing the purge ([52b0b44](https://github.com/strapi-community/plugin-rest-cache/commit/52b0b4454f0ac1c1b2f91f745d18357eb3fcad09))
* coalesce concurrent cache misses and stop racing the purge ([b51ee55](https://github.com/strapi-community/plugin-rest-cache/commit/b51ee55695e67a07062bb861f6c0f560d45b0958))
* correct 1000x cache TTL inflation and purge on all admin write routes ([5dc7a20](https://github.com/strapi-community/plugin-rest-cache/commit/5dc7a20cf6a7dec6c8c5d9d8f62f2c4adf190c4b))
* correct 1000x cache TTL inflation and purge on all admin write routes ([8197205](https://github.com/strapi-community/plugin-rest-cache/commit/8197205cce4abf1fc1b3b982186b9ddbaee2e85b))
* load providers reliably across Node versions and module shapes ([ce7215a](https://github.com/strapi-community/plugin-rest-cache/commit/ce7215a13c99a3e150e7ebbab672edc849948859))
* load providers reliably across Node versions and module shapes ([c403830](https://github.com/strapi-community/plugin-rest-cache/commit/c40383015846e4a80525f5aded07a741381541d3))
* make redis purges safe on a cluster ([6ff9043](https://github.com/strapi-community/plugin-rest-cache/commit/6ff90432b146c2269c426812f87c70afbae5e3bb))
* make redis purges safe on a cluster ([2490ac2](https://github.com/strapi-community/plugin-rest-cache/commit/2490ac2e40570ad6c0a00011d27aef0ddf24d16b))
* make release-please work and version the packages in lockstep ([#198](https://github.com/strapi-community/plugin-rest-cache/issues/198)) ([4ec2746](https://github.com/strapi-community/plugin-rest-cache/commit/4ec2746fe8729dce05537b75d736db7bbd106a1f))
* **publish:** dispatch experimental builds instead of publishing from a PR ([#204](https://github.com/strapi-community/plugin-rest-cache/issues/204)) ([586e59d](https://github.com/strapi-community/plugin-rest-cache/commit/586e59d5ec20c9edd905af110b473a3d6896b42b))
* **publish:** pass the tarball as a path, and make the label one-shot ([#203](https://github.com/strapi-community/plugin-rest-cache/issues/203)) ([466acb1](https://github.com/strapi-community/plugin-rest-cache/commit/466acb190b5d2d2c837922466b0ed92e98c29d2c))
* refuse to cache responses that cannot be safely replayed ([5ccde8a](https://github.com/strapi-community/plugin-rest-cache/commit/5ccde8a3cf83479a744f14e1e176aec2cb4b2ac8))
* refuse to cache responses that cannot be safely replayed ([714f8f0](https://github.com/strapi-community/plugin-rest-cache/commit/714f8f0834153f6ec9a48783b453079c9a16587c))
* **release:** run the deduper from a path that survives the checkout ([#211](https://github.com/strapi-community/plugin-rest-cache/issues/211)) ([06c5f8f](https://github.com/strapi-community/plugin-rest-cache/commit/06c5f8fe4532bf7544a6c04aaa1d72a99beffcf8))
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
* **providers:** convert both provider packages to TypeScript ([#188](https://github.com/strapi-community/plugin-rest-cache/issues/188)) ([c46540f](https://github.com/strapi-community/plugin-rest-cache/commit/c46540f6e8a599b92af948ff25075c8104ce1937))


### Documentation

* give every published package a README ([#196](https://github.com/strapi-community/plugin-rest-cache/issues/196)) ([2f53e09](https://github.com/strapi-community/plugin-rest-cache/commit/2f53e0968eb4e151da0d89c949504568528ec1b1))
* point the provider examples at their TypeScript sources ([#193](https://github.com/strapi-community/plugin-rest-cache/issues/193)) ([b4681d1](https://github.com/strapi-community/plugin-rest-cache/commit/b4681d1a28b4f145c19ce47e1b6a4ffdf375b166))
* rewrite around tasks, generate the type reference, add a contributing guide ([#185](https://github.com/strapi-community/plugin-rest-cache/issues/185)) ([1e3ca6d](https://github.com/strapi-community/plugin-rest-cache/commit/1e3ca6da55438a172020ac7f6b560b2012663006))
* sync README with the published 5.0.1 and backfill changelogs ([380997c](https://github.com/strapi-community/plugin-rest-cache/commit/380997cad55e10db1e57e22ac31270cd17f534df))
* sync README with the published 5.0.1 and backfill changelogs ([9878fbb](https://github.com/strapi-community/plugin-rest-cache/commit/9878fbb788335a68339344d2adeb9793c45deec8))

## [4.2.8](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.2.7...v4.2.8) (2023-07-27)

### Bug Fixes

* fix: Remove community eslint, fix router matching, and various other cleanup stuff by @derrickmehaffy in https://github.com/strapi-community/strapi-plugin-rest-cache/pull/61

## [4.2.7](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.2.6...v4.2.7) (2023-03-15)

### Bug Fixes

* fix(recv): remove transformer plugin by @ComfortablyCoding in https://github.com/strapi-community/strapi-plugin-rest-cache/pull/46

## [4.2.6](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.2.5...v4.2.6) (2022-12-27)

### Bug Fixes

* Update strapi-plugin-redis to v1.0.1 by @derrickmehaffy in https://github.com/strapi-community/strapi-plugin-rest-cache/pull/39
* Add support for Strapi REST API Prefix by @derrickmehaffy in https://github.com/strapi-community/strapi-plugin-rest-cache/pull/38

## [4.2.5](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.2.4...v4.2.5) (2022-12-02)

### Bug Fixes

* Install rest memory provider by default by @beebop1032 in https://github.com/strapi-community/strapi-plugin-rest-cache/pull/30
* Fix del function in cacheStore.js, causes cache key not purged properly by @dinhkhanh in https://github.com/strapi-community/strapi-plugin-rest-cache/pull/27
* Transform data before storing in cache by @nystrand1 in https://github.com/strapi-community/strapi-plugin-rest-cache/pull/35

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

## [4.2.0](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.1.0...v4.2.0) (2022-03-09)

### Bug Fixes

* configuration header sort ([c0eec8f](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/c0eec8f475b3b25722fbb5de659212e25f263534))
* route checking should be absolute ([fdf8666](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/fdf866648a98036b8c70500769cf3bcac42671d8))

### Features

* expose new clearByUid and clearByRegexp functions in cacheStore service ([c7d67fd](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/c7d67fd532ccca66df90b3621061ba2d65b70fe1))

## [4.1.0](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.6...v4.1.0) (2022-03-05)

### Bug Fixes

* better path resolution when using custom delimiters ([943393d](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/943393d97fc36e0995884a05bacc9720a7f78fe1))

### Features

* add strategy debug option ([0dda260](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/0dda26065d17f5b884b224616ffe07c2b8fbcba8))

## [4.0.6](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.5...v4.0.6) (2022-03-02)

### Bug Fixes

* only use boostrap lifecycle to register the plugin ([46eaf0b](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/46eaf0bbf60f67c06cf1d8d0ad95f087f68a58b1))

## [4.0.5](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.4...v4.0.5) (2022-03-02)

### Bug Fixes

* pluginId used to register permissions actions ([3376b4a](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/3376b4a74a53e563d50f520cd02f72be0e6ee89d))

## [4.0.4](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.3...v4.0.4) (2022-02-26)

### Bug Fixes

* add missing server entrypoint ([820c967](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/820c967b414c29b19bf4ba483e15692ba613a4d6))
* ignore unexisting routes instead of throwing ([7f06c9d](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/7f06c9d9633d6a07b741f480352bac6ad86b6678))

## [4.0.3](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.2...v4.0.3) (2022-02-26)

### Bug Fixes

* use short plugin name ([7acc0e7](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/7acc0e790f9a2d060943e7d506a45a515ed0988c))

## [4.0.2](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.1...v4.0.2) (2022-02-24)

### Bug Fixes

* use short plugin name ([8daf416](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/8daf41643c2479c0df19a2fe137cae7ec395ec78))

## [4.0.1](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.0...v4.0.1) (2022-02-24)

### Bug Fixes

* empty npm packages ([1fde26a](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/1fde26a1da956c854661b036bc48483c49f9f75e))

## [4.0.0](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.0-alpha.1...v4.0.0) (2022-01-31)

### Bug Fixes

* peerDependencies fixed version ([4b5e317](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/4b5e317ae9319a91f90d7d7fb62fbcb7401d67af))

### Features

* **core:** add keysPrefix strategy option ([8ed2149](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/8ed21495fadd2d2d709c741c3bccdc48d17376bd))

## [4.0.0-alpha.1](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v4.0.0-alpha.0...v4.0.0-alpha.1) (2022-01-31)

### Bug Fixes

* peerDependencies fixed version ([f43ef96](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/f43ef96b87c274618ecd041b733ecfa22c824c74))

## [4.0.0-alpha.0](https://github.com/strapi-community/strapi-plugin-rest-cache/compare/v1.0.1-alpha.0...v4.0.0-alpha.0) (2022-01-31)

### Bug Fixes

* **redis:** remove ready listener on error ([9a90fa2](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/9a90fa2938650a826dcf293ddda292d8d8f3a175))

* feat(core)!: add keys alterations options ([a4214f2](https://github.com/strapi-community/strapi-plugin-rest-cache/commit/a4214f2fb90259400c1c5a9701b83221ac2fa1bb))

### BREAKING CHANGES

* move headers to keys.useHeaders
add keys.useQueryParams option
