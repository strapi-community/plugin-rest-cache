/**
 * Escaping for the names and values that go into a cache key.
 *
 * A key is `path?query&headers&auth`, and the query and header parts are each
 * `name=value` pairs joined with ",". Nothing used to be escaped, so a value
 * could spell out a separator and the next pair itself: `?locale=x,populate=a`
 * and `?locale=x&populate=a` both keyed as `locale=x,populate=a`, and whichever
 * arrived first was served to the other - cache poisoning by an anonymous
 * caller. Header values could forge a second header the same way, and an "&"
 * in either could move the boundary between the query and header parts.
 *
 * The obvious fix, encodeURIComponent on everything, would move the key of
 * nearly every real request: commas are ordinary in `populate=a,b`,
 * `sort=title:asc,id` and `Accept-Encoding: gzip, deflate`, and "=" in
 * `Accept-Language: en;q=0.9`. A moved key means every existing entry goes
 * cold on upgrade and is never purged, because nothing addresses it any more.
 * So this escapes only what is needed to make the encoding unambiguous, and
 * an ordinary value comes out byte-identical:
 *
 * - "%" always, so an escape in the output cannot be mistaken for a literal
 *   "%2C" a caller sent;
 * - "&" always, so the three parts of a key are always split by exactly two
 *   bare "&";
 * - in a name, anything outside NAME_CHAR, so a name can never contain a
 *   separator;
 * - in a value, a "," only where it is followed by name characters and "=" -
 *   the one shape that reads as the start of another pair. `en-US,en;q=0.9`
 *   is untouched because ";" cannot appear in a name.
 *
 * Decoding is then unique: a bare "," followed by NAME_CHAR* and "=" starts a
 * pair, every other "," belongs to a value, and a name ends at its first "=".
 */

/**
 * Characters a name may carry unescaped: the RFC 9110 token characters, which
 * every header name and every query name Strapi uses is made of, plus the
 * brackets of a nested query name qs left unparsed. "%" is in the set only
 * because it introduces an escape; a literal "%" is still escaped.
 */
const NAME_CHAR = "A-Za-z0-9!#$%'*+.^_`|~\\-\\[\\]";

const NAME_UNSAFE = new RegExp(`[^${NAME_CHAR}]|%`, 'gu');
const VALUE_UNSAFE = new RegExp(`[%&]|,(?=[${NAME_CHAR}]*=)`, 'g');

const percentEncode = (char: string): string =>
  Array.from(Buffer.from(char, 'utf8'), (byte) =>
    `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  ).join('');

export const escapeKeyName = (name: string): string =>
  name.replace(NAME_UNSAFE, percentEncode);

export const escapeKeyValue = (value: string): string =>
  value.replace(VALUE_UNSAFE, percentEncode);

/**
 * A nested query value (`filters[title][$eq]=x` arrives as an object) goes
 * into the key as JSON. Its structural commas are always followed by `"`, `{`,
 * `[` or a literal, never by a name and "=", so only the strings inside need
 * escaping - and escaping them before stringifying leaves the JSON for an
 * ordinary value exactly as it was.
 */
export const escapeKeyJson = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return escapeKeyValue(value);
  }

  if (Array.isArray(value)) {
    return value.map(escapeKeyJson);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [escapeKeyValue(k), escapeKeyJson(v)])
    );
  }

  return value;
};
