import type { Context } from 'koa';

/**
 * Shared vocabulary for the cache.
 *
 * Several bugs in this plugin came from values that were all `string` or all
 * `number` and therefore interchangeable to the compiler when they were not
 * interchangeable in fact. The branded aliases below exist to make those
 * mistakes unrepresentable rather than merely discouraged.
 */

declare const brand: unique symbol;

type Brand<T, B> = T & { readonly [brand]: B };

/**
 * A duration in milliseconds.
 *
 * `maxAge` is milliseconds everywhere in this plugin, but the providers once
 * multiplied it by 1000 again before handing it to cache-manager - whose ttl is
 * also milliseconds - so a configured hour became 41.7 days and nothing ever
 * expired.
 *
 * @see https://github.com/strapi-community/plugin-rest-cache/issues/126
 */
export type Milliseconds = Brand<number, 'Milliseconds'>;

export const ms = (value: number): Milliseconds => value as Milliseconds;

/**
 * A route path as written in the plugin configuration, e.g.
 * "/api/categories/slug/:slug+".
 *
 * Distinct from RegisteredRoutePath because the two are compared directly, and
 * comparing them without normalising the trailing "+" left such routes silently
 * uncached.
 */
export type ConfiguredRoutePath = Brand<string, 'ConfiguredRoutePath'>;

/** A route path as Strapi registered it, including the api prefix. */
export type RegisteredRoutePath = Brand<string, 'RegisteredRoutePath'>;

/**
 * A key as the cache store addresses it, without the configured keysPrefix.
 *
 * Providers must return keys in this form. @keyv/redis tracks keys internally
 * as fully qualified redis keys ("keyv:/api/foo"), and returning that form
 * meant purge regexes matched nothing while the deletes addressed keys that did
 * not exist.
 *
 * @see https://github.com/strapi-community/plugin-rest-cache/issues/131
 */
export type CacheKey = Brand<string, 'CacheKey'>;

/** A Strapi content type uid, e.g. "api::article.article". */
export type ContentTypeUID = `${string}::${string}.${string}`;

/** Decides, per request, whether the cache should be bypassed entirely. */
export type CachePluginHitpass = (ctx: Context) => boolean | Promise<boolean>;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Document service actions that change content, and so must invalidate.
 *
 * `create` and `clone` mint a new documentId that only exists on the result;
 * every other action carries it on the params. Modelling that as a union stops
 * the two being confused.
 *
 * @see https://github.com/strapi-community/plugin-rest-cache/issues/129
 */
export type MintingWriteAction = 'create' | 'clone';
export type TargetedWriteAction =
  | 'update'
  | 'delete'
  | 'publish'
  | 'unpublish'
  | 'discardDraft';
export type WriteAction = MintingWriteAction | TargetedWriteAction;
