# Security policy

## Supported versions

| Version | Supported | Notes |
| --- | --- | --- |
| 5.x | Yes | For Strapi 5. Fixes land here. |
| 4.x | No | For Strapi 4. No longer maintained; upgrade to 5.x. |
| < 4 | No | |

This covers `@strapi-community/plugin-rest-cache` and the providers published from
this repository, `@strapi-community/provider-rest-cache-memory` and
`@strapi-community/provider-rest-cache-redis`.

## Reporting a vulnerability

Report privately through GitHub, not in a public issue:

**https://github.com/strapi-community/plugin-rest-cache/security/advisories/new**

That opens a private security advisory visible only to the maintainers. Please
include:

- the plugin and Strapi versions, and the provider in use;
- the `rest-cache` configuration that exhibits it — the strategy matters, especially
  `hitpass`, `keys`, and `keysPrefix`;
- the requests involved, in order, and the responses you got. The `X-Cache` header
  (`strategy.enableXCacheHeaders: true`) is usually decisive here too;
- what an attacker gets out of it.

You will get a response in the advisory thread. If the report turns out not to be a
vulnerability, we will say so there and, where it makes sense, move it to a public
issue with your agreement.

## What is in scope

This plugin stores HTTP responses and replays them to later callers. The two
vulnerability classes that matter most, and are very welcome as reports, are:

- **Cache poisoning** — any way to get a response stored under a key that other
  requests will match, when it should not have been. Unkeyed request inputs that
  nevertheless influence the response body are the classic route in.
- **Cross-caller data leakage** — one caller being served a body that was produced
  for another. Anything that lets an authenticated response reach an anonymous
  caller, or one user's response reach another user, is in scope.

Also in scope: purge and invalidation bypasses that keep content served after it
should have been evicted, the admin API surface (`admin::hasPermissions` policies on
the plugin's routes), the content-API purge endpoint when
`enableContentApiPurge` is on, and key-prefix handling in the Redis provider.

### Protections that already exist

Please check your finding against these first — it may already be handled, or you may
have found a hole in one of them, which is more interesting:

- A response that sets a `Set-Cookie` is **never** stored. Replaying it would hand one
  caller's session to everybody sharing the key.
- `Cache-Control: no-store` and `Cache-Control: private` are honoured; those responses
  are not stored.
- Non-`2xx` responses, empty bodies, and streams are not stored.
- The default `hitpass` bypasses the cache entirely for any request carrying an
  `authorization` or `cookie` header, so authenticated traffic is not shared by
  default.
- When that default is deliberately turned off, `keys.useAuth` keys entries per
  authenticated caller. The server logs a warning at boot when a content type sets
  `hitpass: false` without `keys.useAuth`.

See [what is never cached](https://strapi-community.github.io/plugin-rest-cache/guide/reference/config.html#what-is-never-cached)
and [cache keys](https://strapi-community.github.io/plugin-rest-cache/guide/caching/keys.html)
for the details.

## What is out of scope

- Vulnerabilities in Strapi itself. Report those to
  [Strapi](https://github.com/strapi/strapi/security/policy).
- Vulnerabilities in Redis, `cache-manager`, `keyv`, or other dependencies. Report them
  upstream; open an issue here if this plugin needs to pin or work around the fix.
- Configurations that are insecure by choice — for example setting `hitpass: false`
  without `keys.useAuth`, which is documented as sharing one entry between callers
  authorised for the same route.
- Denial of service through cache sizing, unbounded key cardinality from query
  parameters, or similar capacity questions. These are configuration and operational
  concerns; open a normal issue.
