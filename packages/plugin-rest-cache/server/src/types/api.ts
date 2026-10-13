import type { CachePluginStrategy } from './CachePluginStrategy';
import type { ContentTypeUID, Milliseconds } from './common';

/**
 * Response contracts for the admin API.
 *
 * These are imported by the admin panel as well as the server, so the two
 * cannot drift: changing a controller's response shape without changing the
 * component that reads it is a compile error rather than a blank cell in the
 * dashboard.
 */

export interface StrategyResponse {
  strategy: CachePluginStrategy;
}

/**
 * Note this is not the provider config as written in config/plugins.
 *
 * `options` is deliberately absent: it is handed straight to the adapter and
 * for redis holds connection details, so the controller allow-lists these two
 * fields rather than returning the object it holds.
 */
export interface ProviderResponse {
  provider: {
    name?: string;
    getTimeout?: number;
  };
}

export interface ContentTypeStats {
  uid: ContentTypeUID | string;
  entries: number;
  maxAge?: Milliseconds;
  hitpass: boolean;
  keysAuthIdentity: boolean;
  /**
   * GET routes that cache authenticated responses under a key that does not
   * identify the caller: resolved `hitpass === false` without
   * `keys.useAuth`. The same routes the boot warning names.
   *
   * This, not `hitpass && !keysAuthIdentity`, is what the dashboard's
   * "Shared across callers" badge reads. Those two describe the content type,
   * and a route's resolved values can differ from its content type's either
   * way. Optional only so an admin bundle still renders against a server
   * that predates the field; this server always sends it.
   */
  unkeyedAuthenticatedRoutes?: string[];
  routes: string[];
  relatedContentTypes: string[];
}

export interface CacheSummary {
  /** Only the provider's name: `options` holds connection credentials. */
  provider: { name?: string };
  strategy: {
    enableEtag: boolean;
    enableXCacheHeaders: boolean;
    enableDocumentServiceMiddleware: boolean;
    clearRelatedCache: boolean;
    keysPrefix: string;
    maxAge: Milliseconds;
  };
  totals: { entries: number; etags: number; contentTypes: number };
  contentTypes: ContentTypeStats[];
}

/**
 * The cached content types an admin may purge.
 *
 * Deliberately only the uids. This is served to admins holding cache.purge
 * but not cache.read-strategy, so it must not grow into a second, less
 * guarded copy of StrategyResponse.
 */
export interface PurgeableContentTypesResponse {
  contentTypes: string[];
}

export interface PurgeRequest {
  contentType: ContentTypeUID | string;
  params?: Record<string, string | number>;
  wildcard?: boolean;
}
