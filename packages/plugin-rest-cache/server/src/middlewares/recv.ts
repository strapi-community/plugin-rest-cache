import type { Context, Next } from 'koa';
import type { Core } from '@strapi/strapi';
import debug from 'debug';

import colors from '../utils/colors';
import { generateCacheKey } from '../utils/keys/generateCacheKey';
import { shouldLookup } from '../utils/middlewares/shouldLookup';
import { etagGenerate } from '../utils/etags/etagGenerate';
import { etagLookup } from '../utils/etags/etagLookup';
import { etagMatch } from '../utils/etags/etagMatch';
import { isCacheable } from '../utils/middlewares/isCacheable';
import { buildCacheControl } from '../utils/middlewares/buildCacheControl';
import type { CacheRouteConfig } from '../types';
import type { CacheKey } from '../types/common';
import type { RestCachePluginConfig } from '../types/config';

/** What a coalescing leader hands to the requests waiting on it. */
interface SharedResponse {
  body: unknown;
  status: number;
}

/**
 * Requests currently fetching from the origin, keyed by cache key.
 *
 * Without this, N concurrent requests for the same uncached key each call the
 * origin - the thundering herd a cache exists to prevent. It fires exactly when
 * it hurts most: on a cold start, immediately after a purge, and at TTL expiry.
 *
 * Shared across every route's middleware instance, because the cache key is
 * already unique per route and per configured key strategy.
 *
 * @see https://github.com/strapi-community/plugin-rest-cache/issues/130
 */
const inFlight = new Map<CacheKey, Promise<SharedResponse>>();

export default function createRecv(
  options: { cacheRouteConfig?: CacheRouteConfig },
  { strapi }: { strapi: Core.Strapi }
) {
  if (!options?.cacheRouteConfig) {
    throw new Error(
      'REST Cache: unable to initialize recv middleware: options.cacheRouteConfig is required'
    );
  }
  const store = strapi.plugin('rest-cache').service('cacheStore');
  const { strategy } = strapi.config.get<RestCachePluginConfig>('plugin::rest-cache');
  const { cacheRouteConfig } = options;
  const { hitpass, maxAge, keys } = cacheRouteConfig;
  const { enableEtag = false, enableXCacheHeaders = false } = strategy;

  // Fixed for the life of the route: it is derived from configuration alone.
  // null means the feature is off and nothing is ever emitted for this route.
  const cacheControl = buildCacheControl(strategy.cacheControl, cacheRouteConfig);

  /**
   * Advertise this route's caching to the caller.
   *
   * Only ever called for a response that is genuinely in, or on its way into,
   * the cache. Callers must not invoke it for a hitpass, for a response
   * isCacheable refused, or before that verdict is known: a Cache-Control the
   * plugin emits early would then be read back by isCacheable as if a handler
   * had set it, and `private` would make the plugin refuse to store its own
   * response.
   *
   * @see https://github.com/strapi-community/plugin-rest-cache/issues/175
   */
  const setCacheControl = (ctx: Context): void => {
    if (!cacheControl) {
      return;
    }

    // A handler that stated its own policy has said something specific about
    // this response, which outranks a blanket route setting - #133 relies on a
    // handler's `no-store` being obeyed rather than replaced.
    if (String(ctx.response.get('Cache-Control') || '') !== '') {
      return;
    }

    ctx.set('Cache-Control', cacheControl);
  };

  return async function recv(ctx: Context, next: Next): Promise<void> {
    // hash
    const cacheKey = generateCacheKey(ctx, keys);

    // hitpass check
    const lookup = await shouldLookup(ctx, hitpass);

    // keep track of the etag
    let etagCached: string | null = null;

    if (lookup) {
      // lookup cached etag
      if (enableEtag) {
        etagCached = await etagLookup(cacheKey);

        if (etagCached && etagMatch(ctx, etagCached)) {
          if (enableXCacheHeaders) {
            ctx.set('X-Cache', 'HIT');
          }

          // The entry is in the cache - an ETag is only stored alongside a body
          // that was stored - so the freshness we advertise is real. A 304 may
          // carry Cache-Control to refresh what the client already holds.
          setCacheControl(ctx);

          // etag match -> send HTTP 304 Not Modified
          ctx.body = null;
          ctx.status = 304;
          return;
        }

        // etag miss
      }

      const cacheEntry = await store.get(cacheKey);

      // hit cache
      if (cacheEntry) {
        debug('strapi:plugin-rest-cache')(
          `[RECV] GET ${cacheKey} ${colors.green('HIT')}`
        );

        if (enableXCacheHeaders) {
          ctx.set('X-Cache', 'HIT');
        }

        if (etagCached) {
          // send back cached etag on hit
          ctx.set('ETag', `"${etagCached}"`);
        }

        setCacheControl(ctx);

        ctx.status = 200;
        ctx.body = cacheEntry;
        return;
      }

      // Cache miss. If an identical request is already fetching, wait for its
      // result instead of making our own trip to the origin.
      const pending = inFlight.get(cacheKey);

      if (pending) {
        try {
          const shared = await pending;

          debug('strapi:plugin-rest-cache')(
            `[RECV] GET ${cacheKey} ${colors.yellow('MISS')} ${colors.grey('(coalesced)')}`
          );

          if (enableXCacheHeaders) {
            ctx.set('X-Cache', 'MISS');
          }

          // Deliberately no Cache-Control here. We borrowed a body from the
          // request that went to the origin and never saw its response headers,
          // so we cannot know whether that request's response was stored or
          // refused by isCacheable. Staying quiet costs one client one
          // revalidation; guessing wrong tells a browser to cache something the
          // plugin itself declined to.
          ctx.status = shared.status;
          ctx.body = shared.body;
          return;
        } catch {
          // The request we were waiting on failed. Fall through and fetch
          // independently rather than inheriting an unrelated failure.
        }
      }
    }

    // Only the request that reaches the origin publishes its result; waiters
    // never register themselves, so a failure cannot cascade.
    let publish: ((value: SharedResponse) => void) | undefined;
    let abandon: ((reason?: unknown) => void) | undefined;

    if (lookup) {
      const shared = new Promise<SharedResponse>((resolve, reject) => {
        publish = resolve;
        abandon = reject;
      });
      // Nothing may be waiting yet, and an unobserved rejection would warn.
      shared.catch(() => {});
      inFlight.set(cacheKey, shared);
    }

    try {
      // fetch backend
      await next();
    } catch (error) {
      abandon?.(error);
      throw error;
    } finally {
      if (lookup) {
        inFlight.delete(cacheKey);
      }
    }

    // fetch done
    if (!lookup) {
      debug('strapi:plugin-rest-cache')(
        `[RECV] GET ${cacheKey} ${colors.magenta('HITPASS')}`
      );

      if (enableXCacheHeaders) {
        ctx.set('X-Cache', 'HITPASS');
      }

      // do not store hitpass response content
      return;
    }

    // deliver
    debug('strapi:plugin-rest-cache')(`[RECV] GET ${cacheKey} ${colors.yellow('MISS')}`);

    if (enableXCacheHeaders) {
      ctx.set('X-Cache', 'MISS');
    }

    // Hand the response to anything waiting on us before writing to the cache,
    // so waiters are not blocked on the store.
    publish?.({ body: ctx.body, status: ctx.status });

    const { cacheable, reason } = isCacheable(ctx);

    if (!cacheable) {
      debug('strapi:plugin-rest-cache')(
        `[RECV] GET ${cacheKey} ${colors.grey(`not cached: ${reason}`)}`
      );
      return;
    }

    // Only now, past the verdict: this response is going into the cache, and
    // isCacheable has already read whatever Cache-Control the handler set.
    setCacheControl(ctx);

    {
      const writes: Array<Promise<unknown>> = [];

      if (enableEtag) {
        const etag = etagGenerate(ctx);

        ctx.set('ETag', `"${etag}"`);

        writes.push(
          store.set(`${cacheKey}_etag`, etag, maxAge).catch(() => {
            debug('strapi:plugin-rest-cache')(
              `[RECV] GET ${cacheKey} ${colors.yellow('Unable to store ETag in cache')}`
            );
          })
        );
      }

      writes.push(
        store.set(cacheKey, ctx.body, maxAge).catch(() => {
          debug('strapi:plugin-rest-cache')(
            `[RECV] GET ${cacheKey} ${colors.yellow('Unable to store Content in cache')}`
          );
        })
      );

      // Await the writes rather than firing and forgetting them.
      //
      // An unawaited write outlives the request, so a purge triggered by a
      // concurrent write can complete first and then be undone by this write
      // landing afterwards - repopulating the cache with data read before the
      // change, which then survives until maxAge. The body and its ETag were
      // also written independently, so a stale ETag could outlive its body and
      // drive 304s against content that no longer existed.
      //
      // See https://github.com/strapi-community/plugin-rest-cache/issues/132
      await Promise.all(writes);
    }
  };
}
