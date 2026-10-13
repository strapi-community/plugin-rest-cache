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
 */
export const isUnkeyedAuthenticatedRoute = (route: CacheRouteConfig): boolean =>
  route.method === 'GET' && route.hitpass === false && route.keys?.useAuth !== true;

/** The paths of the routes `isUnkeyedAuthenticatedRoute` holds for. */
export const unkeyedAuthenticatedRoutes = (
  routes: readonly CacheRouteConfig[]
): string[] => routes.filter(isUnkeyedAuthenticatedRoute).map((route) => route.path);
