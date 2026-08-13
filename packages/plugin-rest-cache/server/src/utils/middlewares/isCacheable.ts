import type { Context } from 'koa';

export interface CacheabilityVerdict {
  cacheable: boolean;
  /** Why the response was refused. Set whenever `cacheable` is false. */
  reason?: string;
}

/**
 * Whether a response can be stored and replayed to a different caller.
 *
 * The cache captures ctx.body and serves it again later, which quietly assumes
 * the body is a plain serialisable value and that the response is not specific
 * to the caller who triggered it. Neither holds for every response.
 *
 * @see https://github.com/strapi-community/plugin-rest-cache/issues/133
 */
export const isCacheable = function (ctx: Context): CacheabilityVerdict {
  // The handler took over the socket and wrote the response itself, so ctx.body
  // is not the response at all. Strapi's own /mcp route does this.
  if (ctx.respond === false) {
    return { cacheable: false, reason: 'handler set ctx.respond = false' };
  }

  if (!ctx.body) {
    return { cacheable: false, reason: 'empty body' };
  }

  if (!(ctx.status >= 200 && ctx.status <= 300)) {
    return { cacheable: false, reason: `status ${ctx.status}` };
  }

  // A stream can only be consumed once. Storing it caches an object that
  // cannot be replayed, and the entry poisons every later request for the key.
  if (typeof (ctx.body as { pipe?: unknown }).pipe === 'function') {
    return { cacheable: false, reason: 'streamed body' };
  }

  // Set-Cookie is issued to one caller. Replaying it hands that caller's
  // session, CSRF token or consent state to everybody else who shares the key.
  const setCookie = ctx.response.get('Set-Cookie');
  if (setCookie && setCookie.length) {
    return { cacheable: false, reason: 'response sets a cookie' };
  }

  // Respect an explicit instruction from the handler not to store the response.
  const cacheControl = String(ctx.response.get('Cache-Control') || '');
  if (/(^|,)\s*(no-store|private)\s*(,|$)/i.test(cacheControl)) {
    return { cacheable: false, reason: `Cache-Control: ${cacheControl}` };
  }

  return { cacheable: true };
};
