'use strict';

/**
 * @typedef {import('../types').CacheRouteConfig} CacheRouteConfig
 */

import colors from '../utils/colors';
import debug from 'debug';

import { generateCacheKey } from '../utils/keys/generateCacheKey';
import { shouldLookup } from '../utils/middlewares/shouldLookup';
import { etagGenerate } from '../utils/etags/etagGenerate';
import { etagLookup } from '../utils/etags/etagLookup';
import { etagMatch } from '../utils/etags/etagMatch';

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
 * @type {Map<string, Promise<{ body: any, status: number }>>}
 */
const inFlight = new Map();

/**
 * @param {{ cacheRouteConfig: CacheRouteConfig }} options
 * @param {{ strapi: import('@strapi/strapi').Strapi }} context
 */
export default function createRecv(options, { strapi }) {
  if (!options?.cacheRouteConfig) {
    throw new Error(
      'REST Cache: unable to initialize recv middleware: options.cacheRouteConfig is required'
    );
  }
  const store = strapi.plugin('rest-cache').service('cacheStore');
  const { strategy } = strapi.config.get('plugin::rest-cache');
  const { cacheRouteConfig } = options;
  const { hitpass, maxAge, keys } = cacheRouteConfig;
  const { enableEtag = false, enableXCacheHeaders = false } = strategy;

  return async function recv(ctx, next) {
    // hash
    const cacheKey = generateCacheKey(ctx, keys);

    // hitpass check
    const lookup = await shouldLookup(ctx, hitpass);

    // keep track of the etag
    let etagCached = null;

    if (lookup) {
      // lookup cached etag
      if (enableEtag) {
        etagCached = await etagLookup(cacheKey);

        if (etagCached && etagMatch(ctx, etagCached)) {
          if (enableXCacheHeaders) {
            ctx.set('X-Cache', 'HIT');
          }

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
        debug('strapi:plugin-rest-cache')(`[RECV] GET ${cacheKey} ${colors.green('HIT')}`);

        if (enableXCacheHeaders) {
          ctx.set('X-Cache', 'HIT');
        }

        if (etagCached) {
          // send back cached etag on hit
          ctx.set('ETag', `"${etagCached}"`);
        }

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
    let publish;
    let abandon;

    if (lookup) {
      const shared = new Promise((resolve, reject) => {
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
      debug('strapi:plugin-rest-cache')(`[RECV] GET ${cacheKey} ${colors.magenta('HITPASS')}`);

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

    if (ctx.body && ctx.status >= 200 && ctx.status <= 300) {
      // @TODO check Cache-Control response header

      const writes = [];

      if (enableEtag) {
        const etag = etagGenerate(ctx, cacheKey);

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
