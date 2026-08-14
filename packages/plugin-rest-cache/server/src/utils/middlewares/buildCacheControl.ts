import type { CacheControlConfig } from '../../types/CacheControlConfig';
import type { CacheRouteConfig } from '../../types/CacheRouteConfig';
import type { Milliseconds } from '../../types/common';

/**
 * Milliseconds to whole seconds.
 *
 * The single conversion in this plugin, and it exists only because
 * `Cache-Control` is defined in seconds while every duration here is
 * milliseconds. Rounding down rather than to nearest: a fractional delta-seconds
 * is invalid per RFC 9111, and erring short means a client refreshes a moment
 * early instead of serving stale content a moment too long.
 *
 * The direction is the whole point. Multiplying instead of dividing turns a
 * configured hour into 114 years of browser cache, which is the same class of
 * mistake as https://github.com/strapi-community/plugin-rest-cache/issues/126,
 * except that it lands in caches this server cannot purge.
 */
const toSeconds = (value: Milliseconds): number => Math.floor(value / 1000);

/**
 * The Cache-Control value for a route, or null if the plugin should stay quiet.
 *
 * Depends only on configuration, so recv computes it once per route at
 * registration rather than per request. Whether it is actually *applied* is a
 * per-request decision recv makes - see the callers there, which refuse for
 * anything that bypassed the cache, was not stored, or already carries a
 * header the handler set.
 *
 * @see https://github.com/strapi-community/plugin-rest-cache/issues/175
 */
export const buildCacheControl = function (
  config: CacheControlConfig | undefined,
  cacheRouteConfig: CacheRouteConfig
): string | null {
  if (!config?.enabled) {
    return null;
  }

  const directives: string[] = [];

  // An entry keyed per caller holds one caller's response. Telling a shared
  // cache it may serve that to anybody is how a CDN hands user A's data to
  // user B - a leak the server cannot see happening, let alone undo. Downgrade
  // rather than trust the configuration: the operator who wrote `public` at the
  // strategy level cannot be expected to re-check it against every route's
  // keys. register.ts warns at boot when this applies.
  // See https://github.com/strapi-community/plugin-rest-cache/issues/113
  const scope =
    config.scope === 'public' && cacheRouteConfig.keys?.useAuth === true
      ? 'private'
      : config.scope;

  directives.push(scope);

  if (config.maxAge !== 'none') {
    const maxAge =
      config.maxAge === 'config' ? cacheRouteConfig.maxAge : config.maxAge;

    directives.push(`max-age=${toSeconds(maxAge)}`);
  }

  if (config.staleWhileRevalidate !== null) {
    directives.push(
      `stale-while-revalidate=${toSeconds(config.staleWhileRevalidate)}`
    );
  }

  return directives.join(', ');
};
