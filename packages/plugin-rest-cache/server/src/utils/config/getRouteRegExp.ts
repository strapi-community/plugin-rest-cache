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
 * (`:documentId`) and must still match the names the purge was given. A
 * character following a backslash is left alone, so an escape in the pattern -
 * a route constraint such as `(\D+)` - keeps its meaning. A path that is
 * already lower-case comes out byte-identical.
 */
const lowerCasePattern = (pattern: string): string =>
  pattern.replace(/\\.|[^\\]+/g, (part) =>
    part.startsWith('\\') ? part : part.toLowerCase()
  );

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Characters a WHATWG URL - a browser, `fetch` - leaves as they are in a path:
 * RFC 3986 unreserved, sub-delims, `:`, `@` and `/`. Kept literal so that a
 * value made only of these gives the same pattern it always did.
 */
const PATH_LITERAL = /[A-Za-z0-9\-._~!$&'()*+,;=:@/]/;

const percentEncode = (char: string): string =>
  Array.from(Buffer.from(char, 'utf8'))
    .map((byte) => `%${byte.toString(16).padStart(2, '0')}`)
    .join('');

/**
 * A purge param as the literal it is in the cache key, never as pattern source.
 *
 * Params are values - a slug, a documentId - and were interpolated into the
 * pattern as written, so a slug of `c++` threw "Nothing to repeat" out of the
 * purge, and `n.ws` also purged the entry for `news`.
 *
 * The key holds the request path as it arrived, still percent-encoded, while a
 * param is the value code has to hand. `café` and `a b` are cached under
 * `caf%c3%a9` and `a%20b`, so they never matched. A value is therefore encoded
 * the way a client puts it on the wire:
 * - an existing `%XX` is taken as already encoded, so a value passed encoded
 *   keeps matching;
 * - characters a path carries as they are stay literal (escaped);
 * - other printable ASCII is sent raw by some clients and encoded by others,
 *   so either form matches - except `#` and `?`, which can only be encoded;
 * - a space, a control character and anything non-ASCII are percent-encoded
 *   as UTF-8. Encoding comes before lower-casing: `É` is `%C3%89`, while the
 *   lower-cased `é` would be `%C3%A9`, a different key.
 */
const paramToPattern = (value: string | number): string => {
  const chars = Array.from(String(value));
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    if (char === '%' && /^[0-9a-f]{2}$/i.test(`${chars[i + 1]}${chars[i + 2]}`)) {
      out += `%${chars[i + 1]}${chars[i + 2]}`;
      i += 2;
    } else if (PATH_LITERAL.test(char)) {
      out += escapeRegExp(char);
    } else if (/^[\x21-\x7e]$/.test(char) && char !== '#' && char !== '?') {
      out += `(?:${escapeRegExp(char)}|${percentEncode(char)})`;
    } else {
      out += percentEncode(char);
    }
  }
  return out;
};

/**
 * A route parameter as path-to-regexp v6 (koa-router) reads it: `:name`, then
 * the rest of the segment, then an optional `?` modifier. The rest of the
 * segment holds a constraint (`(\d+)`) or a `+` / `*` modifier.
 *
 * Params used to be found by turning each name from `route.paramNames` into a
 * regexp. That name is everything after the `:`, so for `:id(\d+)` the
 * constraint became regexp source that did not match its own text, and the
 * pattern matched nothing. Reading the path once also means a value that
 * contains `:` is no longer mistaken for an unresolved param.
 */
const PARAM_TOKEN = /(\/?):(\w+)([^/#?]*)(\?)?/g;

const SEGMENT = '[^\\/#\\?]+';

const parseToken = (rest: string, optional: string | undefined) => {
  const constraint = /^\((.*)\)[+*]?$/.exec(rest)?.[1];
  const modifier = optional ?? (/[+*]$/.test(rest) ? rest.slice(-1) : '');
  return { constraint, modifier };
};

/**
 * The wildcard for one param. A plain `:name` gives the same `([^\/#\?]+)` it
 * always did.
 * - `+` spans segments: a repeatable `:slug+` serves `/slug/a/b`, which the
 *   single-segment pattern never purged.
 * - `?` and `*` take their leading `/` into an optional group: the bare
 *   `/api/x` is stored without a trailing slash, so a pattern requiring
 *   `/api/x/` never purged it.
 * - A constraint is kept, as what the route really accepts.
 */
const wildcardFor = (
  slash: string,
  rest: string,
  optional: string | undefined
): string => {
  const { constraint, modifier } = parseToken(rest, optional);
  const segment = constraint !== undefined ? `(?:${constraint})` : SEGMENT;
  const repeated = `${segment}(?:\\/${segment})*`;
  switch (modifier) {
    case '+':
      return `${slash}(${repeated})`;
    case '?':
      return slash ? `(?:\\/(${segment}))?` : `(${segment})?`;
    case '*':
      return slash ? `(?:\\/(${repeated}))?` : `(${repeated})?`;
    default:
      return `${slash}(${segment})`;
  }
};

/**
 * `String.replace` collapsed the first `//` once per param; kept, so that a
 * value with a leading or trailing `/` - or an empty one - gives the pattern it
 * always did.
 */
const collapseSlashes = (pattern: string, times: number): string => {
  let out = pattern;
  for (let i = 0; i < times; i++) {
    out = out.replace('//', '/');
  }
  return out;
};

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
    const pattern = route.path.replace(
      PARAM_TOKEN,
      (_match, slash: string, _name: string, rest: string, optional?: string) =>
        wildcardFor(slash, rest, optional)
    );

    return [
      new RegExp(`^${lowerCasePattern(collapseSlashes(pattern, route.paramNames.length))}\\?`),
    ];
  }

  if (!params) {
    return [];
  }

  // A route param the purge was not given cannot be guessed, so the route is
  // left out rather than matched too broadly.
  let unresolved = false;
  // A function replacement, so a `$` in the value is not read as a
  // replacement pattern (`$&`, `$1`) by String.replace.
  const pattern = route.path.replace(
    PARAM_TOKEN,
    (match, slash: string, name: string, rest: string, optional?: string) => {
      if (!Object.prototype.hasOwnProperty.call(params, name)) {
        unresolved = true;
        return match;
      }
      // An optional param given as '' is the bare path, which is stored with
      // no trailing slash. The leftover `?` below used to match it by
      // accident; this keeps that working.
      const { modifier } = parseToken(rest, optional);
      if (params[name] === '' && (modifier === '?' || modifier === '*')) {
        return '';
      }
      // The modifier is consumed with the param. It used to stay behind, so
      // `:slug?` with `abc` gave `abc?`, which also matched `ab`.
      return `${slash}${paramToPattern(params[name])}`;
    }
  );

  if (unresolved) {
    return [];
  }

  return [
    new RegExp(
      `^${lowerCasePattern(collapseSlashes(pattern, Object.keys(params).length))}\\?`
    ),
  ];
};
