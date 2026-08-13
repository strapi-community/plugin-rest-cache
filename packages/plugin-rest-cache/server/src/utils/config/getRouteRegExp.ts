import type { CacheRouteConfig } from '../../types';

/**
 * Get regexs to match CustomRoute keys with given params
 *
 * The patterns are anchored with `^` on the route path and terminated with an
 * escaped `?`, which is what separates the path from the query-string portion
 * of a cache key. Anything appended to a key after that separator - the query
 * params, the vary headers, the caller identity - is therefore still matched by
 * these, but anything prepended would not be.
 */
export const getRouteRegExp = function (
  route: CacheRouteConfig,
  params: Record<string, string | number> | null | undefined,
  wildcard = false
): RegExp[] {
  // route not contains any params -> clear
  if (!route.paramNames || !route.paramNames.length) {
    return [new RegExp(`^${route.path}\\?`)];
  }

  // wildcard: clear all routes
  if (wildcard) {
    let pattern: string = route.path;
    for (const paramName of route.paramNames) {
      pattern = pattern
        .replace(new RegExp(`:${paramName}([^\\/#\\?]*)`, 'g'), '([^\\/#\\?]+)')
        .replace('//', '/');
    }

    return [new RegExp(`^${pattern}\\?`)];
  }

  if (!params) {
    return [];
  }

  const paramNames = Object.keys(params);
  const regExps: RegExp[] = [];

  let pattern: string = route.path;
  for (const paramName of paramNames) {
    pattern = pattern
      .replace(new RegExp(`:${paramName}([^\\/#\\?]*)`, 'g'), String(params[paramName]))
      .replace('//', '/');
  }

  // add if pattern does not contain any unresolved params
  if (!pattern.includes(':')) {
    regExps.push(new RegExp(`^${pattern}\\?`));
  }

  return regExps;
};
