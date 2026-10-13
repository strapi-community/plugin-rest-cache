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
  /** See {@link typeToKeep}. */
  type?: string;
}

/** A request that is fetching from the origin, as seen by later requests. */
interface InFlightRead {
  shared: Promise<SharedResponse>;
  /** cacheStore.generation when this read started, before calling the origin. */
  generation: number;
}

/**
 * Types that can never make a browser run anything: it shows them as text or
 * offers them as a download. Replaying one is never more dangerous than the
 * `text/plain` Koa infers for a string body.
 */
const PASSIVE_TYPES = new Set([
  'text/plain',
  'text/csv',
  'text/tab-separated-values',
  'application/json',
]);

/**
 * Types replayed only for a body Koa would serve as `text/html` anyway.
 *
 * A browser renders XML and can run script through it - an
 * `<?xml-stylesheet?>` instruction applies XSLT, which can emit HTML. That is
 * no more than `text/html` already allows, so for a body starting with `<`
 * (Koa's `text/html` case) restoring it cannot make the response more active
 * than every HIT already was. For any other body it would, so it is not
 * restored there.
 *
 * Deliberately excluded everywhere: `text/html`, `application/xhtml+xml`,
 * `image/svg+xml` and `text/xml`, which are markup a browser runs script from
 * directly, and script and style types (`text/javascript`, `text/css`), which
 * a page can load cross-origin by type where `text/html` would be refused.
 * Those, and any type not listed here, fall back to Koa's inference - exactly
 * what a HIT served before types were kept.
 */
const MARKUP_TYPES = new Set(['application/xml']);

/**
 * Whether a stored type may be replayed with this body.
 *
 * The type comes from the one request that reached the origin, and a handler
 * may choose it from something that is not part of the cache key - Accept, a
 * header, an ignored query parameter. Replayed unchecked, that one caller
 * chooses the type for everyone sharing the entry: ask for `text/html` once
 * and every later caller is served the body as HTML, which for a body holding
 * user content is stored XSS. Before types were kept Koa inferred the type
 * from the body alone, identically for every caller, so no caller could
 * choose it. A type is therefore only replayed when it cannot make the body
 * more active than that inference would.
 *
 * Checked on every replay rather than only when storing, so an entry written
 * by anything else cannot carry an active type into a response either.
 */
const isReplayable = (type: string, body: string): boolean => {
  const [essence, ...params] = type.toLowerCase().split(';');
  const mime = essence.trim();

  // Koa encodes a string body as UTF-8 whatever the header says, so any other
  // declared charset is wrong for the bytes on the wire - and an exotic one
  // such as UTF-7 is itself an old XSS vector.
  const charsetOk = params.every((param) => {
    const [name, value = ''] = param.split('=').map((part) => part.trim());
    return name !== 'charset' || value.replace(/"/g, '') === 'utf-8';
  });

  if (!charsetOk) {
    return false;
  }

  if (PASSIVE_TYPES.has(mime)) {
    return true;
  }

  // The same test Koa applies when it infers `text/html` for a string.
  return MARKUP_TYPES.has(mime) && /^\s*</.test(body);
};

/**
 * The Content-Type to store and replay with this response, if Koa would not
 * arrive at the same one by itself and it is safe to replay.
 *
 * Replaying a body means assigning it to ctx.body, and Koa then guesses the
 * type from it. For an object that guess is JSON - which is what Koa set on the
 * MISS too, unconditionally - so JSON entries need nothing kept and stay
 * exactly the shape earlier versions wrote. For a string the guess is
 * `text/plain`, or `text/html` if it starts with `<`, whatever the handler
 * said: CSV turned into `text/plain` and XML into `text/html` on every HIT.
 *
 * A type that {@link isReplayable} refuses is not stored at all, so its entry
 * keeps the older `{data}` shape.
 */
const typeToKeep = (ctx: Context): string | undefined => {
  if (typeof ctx.body !== 'string') {
    return undefined;
  }

  const type = String(ctx.response.get('Content-Type') || '');

  return type && isReplayable(type, ctx.body) ? type : undefined;
};

/**
 * Serve a stored or borrowed body with the type it was produced with.
 *
 * The header has to be in place before the body is assigned: Koa only infers a
 * type for a string body when none is set yet. Absent a type - every JSON
 * entry, every entry written before types were kept, and every type
 * {@link isReplayable} refuses - nothing is set and Koa infers exactly as it
 * always did.
 */
const replay = (ctx: Context, body: unknown, type: string | undefined): void => {
  if (type && typeof body === 'string' && isReplayable(type, body)) {
    ctx.set('Content-Type', type);
  }

  ctx.body = body;
};

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
const inFlight = new Map<CacheKey, InFlightRead>();

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

      const cacheEntry = await store.getEntry(cacheKey);

      // hit cache
      if (cacheEntry?.data) {
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
        replay(ctx, cacheEntry.data, cacheEntry.type);
        return;
      }

      // Cache miss. If an identical request is already fetching, wait for its
      // result instead of making our own trip to the origin.
      //
      // Not if a purge for this key has started since that request read the
      // origin: it is carrying pre-write data, and a request that arrives after
      // the write returned must see the write. Fetch independently instead.
      const pending = inFlight.get(cacheKey);

      if (pending && !store.purgedSince(pending.generation, cacheKey)) {
        try {
          const shared = await pending.shared;

          debug('strapi:plugin-rest-cache')(
            `[RECV] GET ${cacheKey} ${colors.yellow('MISS')} ${colors.grey('(coalesced)')}`
          );

          if (enableXCacheHeaders) {
            ctx.set('X-Cache', 'MISS');
          }

          // Deliberately no Cache-Control here. We borrowed a body from the
          // request that went to the origin and never saw its response headers.
          // It is only ever handed a response that passed isCacheable - a
          // refused one releases us to fetch for ourselves below - but the
          // store write may still fail, or be skipped because the read raced
          // a purge, and staying quiet costs one client one
          // revalidation where guessing wrong tells a browser to cache
          // something the plugin did not.
          ctx.status = shared.status;
          replay(ctx, shared.body, shared.type);
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

    // Read before the origin is called, so any purge that starts after this
    // point is one this response may have raced. See purgedSince.
    const generation = store.generation;
    let ownRead: InFlightRead | undefined;

    if (lookup) {
      const shared = new Promise<SharedResponse>((resolve, reject) => {
        publish = resolve;
        abandon = reject;
      });
      // Nothing may be waiting yet, and an unobserved rejection would warn.
      shared.catch(() => {});
      ownRead = { shared, generation };
      inFlight.set(cacheKey, ownRead);
    }

    try {
      // fetch backend
      await next();
    } catch (error) {
      abandon?.(error);
      throw error;
    } finally {
      // Only our own entry. A request that declined to join us after a purge
      // has registered its own read under the same key, and removing it would
      // let a third request stampede the origin alongside it.
      if (ownRead && inFlight.get(cacheKey) === ownRead) {
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

    let verdict: ReturnType<typeof isCacheable>;
    try {
      verdict = isCacheable(ctx);
    } catch (error) {
      // Waiters are only ever released by a publish or an abandon. Deciding
      // the verdict before publishing means a throw here would otherwise leave
      // every concurrent caller waiting forever.
      abandon?.(error);
      throw error;
    }
    const { cacheable, reason } = verdict;

    if (!cacheable) {
      // Waiters must not get a response the plugin refuses to store. Coalescing
      // only merges requests that would have shared a cache entry, and this one
      // would not have: a `private` or `no-store` body belongs to the caller
      // who asked, a Set-Cookie is that caller's alone, and a raw or streamed
      // response has no body to hand over at all. Handing it over anyway gave
      // every concurrent caller the leader's private response. Release them to
      // fetch for themselves, exactly as when the leader fails.
      abandon?.(new Error('response is not shareable'));

      debug('strapi:plugin-rest-cache')(
        `[RECV] GET ${cacheKey} ${colors.grey(`not cached: ${reason}`)}`
      );
      return;
    }

    // Hand the response to anything waiting on us before writing to the cache,
    // so waiters are not blocked on the store.
    const type = typeToKeep(ctx);
    publish?.({ body: ctx.body, status: ctx.status, type });

    // A purge for this key started while we were reading the origin, so this
    // body may predate the write that triggered it. Storing it now would undo
    // the purge until maxAge. It is still returned to this caller, and to the
    // requests that joined us before the purge, all of which were issued
    // before the write returned. Requests arriving later fetch for
    // themselves. No Cache-Control either: nothing is going into the cache.
    if (store.purgedSince(generation, cacheKey)) {
      debug('strapi:plugin-rest-cache')(
        `[RECV] GET ${cacheKey} ${colors.grey('not cached: purged while in flight')}`
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
        store.set(cacheKey, ctx.body, maxAge, { type }).catch(() => {
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

      // A purge that started while those writes were in progress may have
      // listed the keys before ours landed, and so not deleted it. Remove it
      // ourselves rather than leave a pre-write body cached until maxAge.
      if (store.purgedSince(generation, cacheKey)) {
        await store.delMany([cacheKey, `${cacheKey}_etag`]);
      }
    }
  };
}
