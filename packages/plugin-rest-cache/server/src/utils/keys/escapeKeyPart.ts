/**
 * Escaping for the names and values that go into a cache key.
 *
 * A key is `path?query&headers&auth`, and the query and header parts are each
 * `name=value` pairs joined with ",". Nothing used to be escaped, so one
 * request could spell out another's key: `?locale=x,populate=a` and
 * `?locale=x&populate=a` both keyed as `locale=x,populate=a`, and whichever
 * arrived first was served to the other - cache poisoning by an anonymous
 * caller. A header value could forge a second header the same way, an "&"
 * could move the boundary between parts, and a string that looked like JSON
 * (`?f={"a":"b"}`) keyed like the object qs builds from `?f[a]=b`.
 *
 * The rule: a string is kept as it is unless it contains a character that
 * could be read as structure, in which case the whole string is passed
 * through encodeURIComponent. That gives four invariants, each easy to check:
 *
 * 1. A name never contains "%", "&", "," or "=".
 * 2. A value never contains "%" unless it was encoded, and an encoded value
 *    always does - so a raw value and an encoded one cannot be equal.
 * 3. A value never contains "&" or "=". With (1), every "=" in a part ends a
 *    name, every name starts after the last "," before it, and the part
 *    splits into pairs exactly one way; every "&" in a key is a separator.
 * 4. A raw scalar never starts with "{", "[" or '"', and a nested value is
 *    JSON of an object or array, which always does - so they cannot be equal.
 *    Inside the JSON every string obeys (2) and (3), and JSON adds no "=",
 *    "&" or "%" of its own.
 *
 * Values may keep their commas: (3) is what makes that safe, and commas are
 * ordinary in `populate=a,b`, `sort=title:asc,id` and
 * `Accept-Encoding: gzip, deflate`. Encoding them would move those keys. Only
 * a value containing "%", "&", "=" or a leading "{", "[" or '"' gets a new key,
 * which costs one cold entry: the old entry is still purged, because purge
 * patterns are anchored on the path.
 */

// Encoded when matched. "," is structure in a name, but not in a value.
const VALUE_STRUCTURE = /[%&=]|^[{["]/;
const NAME_STRUCTURE = /[%&,=]|^[{["]/;

/**
 * encodeURIComponent turns every character above into %XX and never emits
 * "&", ",", "=", "{", "[" or '"'. It throws on a lone surrogate, which a
 * request must not be able to turn into a 500, so those are replaced first.
 * qs leaves undecodable input as literal "%XX", so in practice none arrive.
 */
const encode = (s: string): string => {
  try {
    return encodeURIComponent(s);
  } catch {
    return encodeURIComponent(s.replace(/[\uD800-\uDFFF]/g, '�'));
  }
};

export const escapeKeyName = (name: string): string =>
  NAME_STRUCTURE.test(name) ? encode(name) : name;

export const escapeKeyValue = (value: string): string =>
  VALUE_STRUCTURE.test(value) ? encode(value) : value;

/**
 * A nested query value (`populate[author]=true` arrives as an object) goes
 * into the key as JSON, as it always has, so its key does not move. Every
 * string inside - keys included - is escaped first, which is what keeps
 * invariants (2) and (3) true of the JSON as a whole.
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
