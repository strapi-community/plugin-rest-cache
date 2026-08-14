<div align="center">
<h1>Strapi REST Cache Plugin</h1>

<p style="margin-top: 0;">Speed-up HTTP requests with LRU cache.</p>

<p>
  <a href="https://www.npmjs.org/package/@strapi-community/plugin-rest-cache">
    <img src="https://img.shields.io/npm/v/@strapi-community/plugin-rest-cache/latest.svg" alt="NPM Version" />
  </a>
  <a href="https://www.npmjs.org/package/@strapi-community/plugin-rest-cache">
    <img src="https://img.shields.io/npm/dm/@strapi-community/plugin-rest-cache" alt="Monthly download on NPM" />
  </a>
  <a href="https://github.com/strapi-community/plugin-rest-cache/actions/workflows/tests.yml">
    <img src="https://github.com/strapi-community/plugin-rest-cache/actions/workflows/tests.yml/badge.svg" alt="Tests" />
  </a>
</p>
</div>

A caching layer for the Strapi REST API. It injects a middleware that stores `GET`
responses, keyed by route and query, and invalidates them when the underlying
content changes — so you serve cached responses without serving stale ones.

Cached content lives in a **provider** (in-memory, Redis, or your own). What gets
cached, and for how long, is described by a **strategy** in your plugin config.

![REST Cache admin panel](https://raw.githubusercontent.com/strapi-community/plugin-rest-cache/main/docs/public/screenshots/settings-overview.png)

## Features

- **Pluggable providers.** In-memory by default; Redis via
  `@strapi-community/provider-rest-cache-redis`. Custom providers implement the
  `CacheProvider` abstract class.
- **Per-content-type and per-route caching.** Cache a list of content types with
  their default routes, or declare custom routes with their own `maxAge`,
  `paramNames` and key strategy.
- **Configurable cache keys.** Key on query params (`keys.useQueryParams`),
  specific request headers (`keys.useHeaders`), and — *since 5.1.0* — on the
  authenticated caller (`keys.useAuth`), so two callers authorised for the same
  route do not share one entry.
- **Automatic invalidation through the document service.** *Since 5.1.0*,
  invalidation hooks `strapi.documents()` rather than HTTP routes, so it catches
  GraphQL mutations, admin panel edits, scheduled Content Releases and any custom
  `strapi.documents()` call — not only REST writes. Related content types can be
  purged alongside (`clearRelatedCache`).
- **Request coalescing.** *Since 5.1.0*, N concurrent misses on the same key make
  one call to the origin and the rest wait on it. Matters on cold start, right
  after a purge, and at TTL expiry.
- **ETag and `304 Not Modified`** support (`enableEtag`).
- **`X-Cache` response headers** — `HIT`, `MISS`, `HITPASS` (`enableXCacheHeaders`).
- **Hitpass.** A per-request predicate that bypasses the cache entirely. The
  default bypasses any request carrying an `Authorization` header or a cookie.
- **Admin dashboard.** *Since 5.1.0*, Settings → REST Cache shows the resolved
  strategy, live entry counts per content type, and purge controls.
- **Homepage widget.** *Since 5.1.0*, a summary of what the cache currently holds.
- **Content-manager controls.** *Since 5.1.0*, a cache panel on the edit view plus
  purge actions on the edit and list views.
- **Programmatic purging.** Admin routes and internal services, plus an opt-in
  content API purge endpoint (`enableContentApiPurge`).

## Requirements

- Strapi `>= 5.0.0`
- Node `>= 20`

Looking for Strapi v4? Use the [legacy package](https://www.npmjs.com/package/strapi-plugin-rest-cache).
Looking for Strapi v3? Use [strapi-middleware-cache](https://github.com/patrixr/strapi-middleware-cache/).

## Quick start

Install the plugin.

npm:

```bash
npm install @strapi-community/plugin-rest-cache
```

yarn:

```bash
yarn add @strapi-community/plugin-rest-cache
```

pnpm:

```bash
pnpm add @strapi-community/plugin-rest-cache
```

Then list the content types you want cached in `./config/plugins.js`:

```js
module.exports = {
  'rest-cache': {
    config: {
      provider: {
        name: 'memory',
        options: {
          maxSize: 32767,
        },
      },
      strategy: {
        contentTypes: [
          'api::category.category',
          'api::article.article',
          'api::homepage.homepage',
        ],
      },
    },
  },
};
```

That caches the default `find` and `findOne` routes of those content types for one
hour (`maxAge`, in milliseconds) and purges them when their content changes.

For Redis, install `@strapi-community/plugin-redis` and
`@strapi-community/provider-rest-cache-redis` alongside the plugin and set
`provider.name` to `redis` — see the
[installation guide](https://strapi-community.github.io/plugin-rest-cache/guide/getting-started).

## Documentation

Full documentation lives at
**[strapi-community.github.io/plugin-rest-cache](https://strapi-community.github.io/plugin-rest-cache/)**.

- [Installation](https://strapi-community.github.io/plugin-rest-cache/guide/getting-started)
- [Provider configuration](https://strapi-community.github.io/plugin-rest-cache/guide/providers/) —
  [memory](https://strapi-community.github.io/plugin-rest-cache/guide/providers/memory),
  [redis](https://strapi-community.github.io/plugin-rest-cache/guide/providers/redis),
  [custom](https://strapi-community.github.io/plugin-rest-cache/guide/providers/custom)
- [Strategy configuration](https://strapi-community.github.io/plugin-rest-cache/guide/reference/config) —
  [content types](https://strapi-community.github.io/plugin-rest-cache/guide/caching/content-types),
  [custom routes](https://strapi-community.github.io/plugin-rest-cache/guide/caching/custom-routes),
  [cache keys](https://strapi-community.github.io/plugin-rest-cache/guide/caching/keys),
  [debug mode](https://strapi-community.github.io/plugin-rest-cache/guide/troubleshooting)
- [Services and admin routes](https://strapi-community.github.io/plugin-rest-cache/guide/reference/services)

## Contributing

Contributors and maintainers are wanted. See [CONTRIBUTING.md](https://github.com/strapi-community/plugin-rest-cache/blob/main/CONTRIBUTING.md)
for the repo layout, how to run the playgrounds, and how to run the test suites.
Bugs and feature requests go in
[issues](https://github.com/strapi-community/plugin-rest-cache/issues).

## License

See the [LICENSE](https://github.com/strapi-community/plugin-rest-cache/blob/main/LICENSE) file for licensing information.
