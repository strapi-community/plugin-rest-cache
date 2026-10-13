import type { CacheRouteConfig } from '../../types';

/**
 * Whether a route caches authenticated responses under a key that does not
 * identify the caller.
 *
 * Judged on the values the route actually resolved to, not on its content
 * type's. A listed route can set `hitpass: false` itself under a content type
 * that keeps the default, and a content type's `hitpass: false` is not
 * inherited by listed routes whose keys do not identify the caller - they keep
 * the strategy's bypass as a function (see listedRouteHitpass), which is never
 * `=== false`. A check on the content type alone gets both of those wrong.
 * See https://github.com/strapi-community/plugin-rest-cache/issues/230
 *
 * The boot warning and the dashboard's "Shared across callers" badge both
 * read this, so the two cannot disagree again.
 *
 * `useAuth` is tested for truthiness because that is what generateCacheKey
 * does, and the question here is whether the key identifies the caller. The
 * type says boolean, but a JavaScript config can pass anything - `env()`
 * returns strings - and `=== true` flagged a route keyed by `"true"` as
 * shared when its entries were already per caller. Nothing coerces useAuth
 * at resolution, and nothing should here either: the hitpass, Cache-Control
 * and stats checks compare `=== true`, and coercing would change what they
 * bypass and emit for those configurations.
 */
export const isUnkeyedAuthenticatedRoute = (route: CacheRouteConfig): boolean =>
  route.method === 'GET' && route.hitpass === false && !route.keys?.useAuth;

/** The paths of the routes `isUnkeyedAuthenticatedRoute` holds for. */
export const unkeyedAuthenticatedRoutes = (
  routes: readonly CacheRouteConfig[]
): string[] => routes.filter(isUnkeyedAuthenticatedRoute).map((route) => route.path);
