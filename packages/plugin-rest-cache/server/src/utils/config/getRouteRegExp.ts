import type { CacheRouteConfig } from '../../types';

/**
 * Lower-case a pattern the way generateCacheKey lower-cases the request path.
 *
 * Every cache key's path is lower-cased, so a pattern built from a route
 * configured as `/api/categories/bySlug/:slug` - or from a purge param such as
 * `News` - could never match the key it was meant to purge, not even with a
 * wildcard purge. The entry then survived every write and every manual purge
 * until maxAge.
 *
 * Applied after param substitution: param names are case-sensitive
 * (`:documentId`) and must still match `route.paramNames`. A character
 * following a backslash is left alone, so an escape in the pattern (`\D`,
 * `\S`) keeps its meaning. A path that is already lower-case comes out
 * byte-identical.
 */
const lowerCasePattern = (pattern: string): string =>
  pattern.replace(/\\.|[^\\]+/g, (part) =>
    part.startsWith('\\') ? part : part.toLowerCase()
  );

/**
 * A purge param as a literal, never as pattern source.
 *
 * Params are values - a slug, a documentId - and were interpolated into the
 * pattern as written, so a slug of `c++` threw "Nothing to repeat" out of the
 * purge, and `n.ws` also purged the entry for `news`.
 */
const escapeParam = (value: string | number): string =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
    return [new RegExp(`^${lowerCasePattern(route.path)}\\?`)];
  }

  // wildcard: clear all routes
  if (wildcard) {
    let pattern: string = route.path;
    for (const paramName of route.paramNames) {
      pattern = pattern
        .replace(new RegExp(`:${paramName}([^\\/#\\?]*)`, 'g'), '([^\\/#\\?]+)')
        .replace('//', '/');
    }

    return [new RegExp(`^${lowerCasePattern(pattern)}\\?`)];
  }

  if (!params) {
    return [];
  }

  const paramNames = Object.keys(params);
  const regExps: RegExp[] = [];

  let pattern: string = route.path;
  for (const paramName of paramNames) {
    // A function replacement, so a `$` in the value is not read as a
    // replacement pattern (`$&`, `$1`) by String.replace.
    const literal = escapeParam(params[paramName]);
    pattern = pattern
      .replace(new RegExp(`:${paramName}([^\\/#\\?]*)`, 'g'), () => literal)
      .replace('//', '/');
  }

  // add if pattern does not contain any unresolved params
  if (!pattern.includes(':')) {
    regExps.push(new RegExp(`^${lowerCasePattern(pattern)}\\?`));
  }

  return regExps;
};
