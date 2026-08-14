import { ms } from './common';
import type { Milliseconds } from './common';
import type { CacheControlConfigInput } from './inputs';

/**
 * What `Cache-Control` to put on a response this plugin cached.
 *
 * Design and original implementation by `@pinkasey` in
 * https://github.com/strapi-community/plugin-rest-cache/pull/96, which targeted
 * Strapi 4 and can no longer be rebased. Carried forward by
 * https://github.com/strapi-community/plugin-rest-cache/issues/175.
 *
 * Simplified from #96's two nested types - a `CacheControlHeaderConfig`
 * wrapping a `CacheControlResponseHeaderConfig` - into the one flat block
 * below, because only the response direction is implemented here. Honouring an
 * incoming request `Cache-Control` is still open, and a wrapper whose only
 * member today is `response` buys nothing while making every user write
 * `cacheControl.response.maxAge`. Should the request direction land, it can add
 * a `cacheControl.request` block without changing any of these names.
 *
 * #96's `CacheControlResponseMaxAge` enum - NONE / CONFIG / a number - is kept,
 * as the union on `maxAge`. That is the part carrying the meaning: "say
 * nothing", "say what the route is actually cached for", or "say this instead".
 *
 * Off by default and meant to stay opt-in: the header moves caching to browsers
 * and CDNs, where a purge cannot reach it, so every emitted `max-age` is a
 * window of guaranteed staleness that an operator has to choose knowingly.
 */
export class CacheControlConfig {
  /** Emit the header at all. */
  enabled: boolean = false;

  /**
   * `none` omits the `max-age` directive, `config` takes the route's resolved
   * `maxAge`, and a number overrides it.
   *
   * That number is MILLISECONDS, like every other duration in this plugin, even
   * though the directive it ends up in is seconds. A single field that meant
   * seconds while `maxAge`, `ttl` and `staleWhileRevalidate` meant milliseconds
   * is precisely the ambiguity behind
   * https://github.com/strapi-community/plugin-rest-cache/issues/126. The one
   * conversion lives in buildCacheControl.
   */
  maxAge: 'none' | 'config' | Milliseconds = 'config';

  /**
   * `private` means only the end client may store the response; `public` also
   * allows shared caches such as a CDN.
   *
   * Defaults to `private`, the answer that cannot leak: a wrongly-public
   * response is served to the wrong person by a cache the server does not own.
   * `public` is downgraded to `private` on any route whose keys identify the
   * caller - see buildCacheControl.
   */
  scope: 'public' | 'private' = 'private';

  /**
   * How long a cache may keep serving the stale response while it refreshes,
   * or null to omit the directive.
   *
   * Milliseconds, for the same reason as `maxAge` above.
   */
  staleWhileRevalidate: Milliseconds | null = null;

  constructor(options: CacheControlConfigInput = {}) {
    const {
      enabled = false,
      maxAge = 'config',
      scope = 'private',
      staleWhileRevalidate = null,
    } = options;

    this.enabled = enabled;
    this.maxAge = typeof maxAge === 'number' ? ms(maxAge) : maxAge;
    this.scope = scope;
    this.staleWhileRevalidate =
      staleWhileRevalidate === null || staleWhileRevalidate === undefined
        ? null
        : ms(staleWhileRevalidate);
  }
}
