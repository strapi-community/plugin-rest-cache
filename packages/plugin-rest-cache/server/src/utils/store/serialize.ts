/**
 * What is kept about a response besides its body.
 *
 * Optional throughout: an entry written by an earlier version holds the body
 * alone, and an entry that needs nothing more is still written that way.
 */
export interface CacheEntryMeta {
  /**
   * The response's Content-Type header, verbatim.
   *
   * Without it a HIT assigns the stored body to ctx.body and Koa guesses the
   * type: `text/plain` for any string, `text/html` for one starting with `<`.
   * A handler that served `text/csv` or `application/xml` on the MISS served
   * something else on every HIT after it.
   */
  type?: string;
}

export const serialize = function (data: unknown, meta: CacheEntryMeta = {}): string {
  // Only add a key when there is something to keep, so every entry that needs
  // nothing more - every JSON response - is byte-for-byte what earlier
  // versions wrote, and a store shared with an older plugin version during a
  // rolling upgrade stays readable by both.
  if (meta.type) {
    return JSON.stringify({ data, type: meta.type });
  }

  return JSON.stringify({ data });
};
