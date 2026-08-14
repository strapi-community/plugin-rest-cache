import type {
  CachePluginHitpass,
  ContentTypeUID,
  HttpMethod,
  Milliseconds,
} from './common';
import type { CacheControlConfig } from './CacheControlConfig';
import type { CacheKeysConfig } from './CacheKeysConfig';
import type { CacheRouteConfig } from './CacheRouteConfig';
import type { CacheContentTypeConfig } from './CacheContentTypeConfig';

/**
 * The shapes a user may write in config/plugins.
 *
 * Deliberately separate from the resolved classes: what someone writes is
 * partial and loosely typed, what the plugin runs on is complete. Conflating
 * the two is how `maxAge` ended up defaulting to the boolean `true` in one
 * constructor while being documented as milliseconds everywhere else.
 */

export interface CacheControlConfigInput {
  enabled?: boolean;
  /**
   * 'none' omits max-age, 'config' uses the route's maxAge, a number overrides
   * it. The number is milliseconds - see CacheControlConfig.
   */
  maxAge?: 'none' | 'config' | Milliseconds | number;
  scope?: 'public' | 'private';
  /** Milliseconds, or null/undefined to omit the directive. */
  staleWhileRevalidate?: Milliseconds | number | null;
}

export interface CacheKeysConfigInput {
  useHeaders?: string[];
  useQueryParams?: boolean | string[];
  useAuth?: boolean;
}

export interface CacheRouteConfigInput {
  path?: string;
  method?: HttpMethod;
  paramNames?: string[];
  maxAge?: Milliseconds | number;
  hitpass?: CachePluginHitpass | boolean;
  keys?: CacheKeysConfig | CacheKeysConfigInput;
}

export interface CacheContentTypeConfigInput {
  contentType?: ContentTypeUID | string;
  singleType?: boolean;
  injectDefaultRoutes?: boolean;
  maxAge?: Milliseconds | number;
  hitpass?: CachePluginHitpass | boolean;
  keys?: CacheKeysConfig | CacheKeysConfigInput;
  routes?: CacheRouteConfig[] | CacheRouteConfigInput[];
  relatedContentTypeUid?: string[];
  plugin?: string;
}

export interface CachePluginStrategyInput {
  debug?: boolean;
  enableEtag?: boolean;
  enableXCacheHeaders?: boolean;
  enableAdminCTBMiddleware?: boolean;
  enableDocumentServiceMiddleware?: boolean;
  enableContentApiPurge?: boolean;
  resetOnStartup?: boolean;
  clearRelatedCache?: boolean;
  maxAge?: Milliseconds | number;
  keysPrefix?: string;
  contentTypes?: Array<ContentTypeUID | string | CacheContentTypeConfigInput> | CacheContentTypeConfig[];
  keys?: CacheKeysConfig | CacheKeysConfigInput;
  /**
   * Whether to tell the caller about the caching, by emitting a Cache-Control
   * header on responses this plugin cached. Off unless asked for.
   *
   * @see https://github.com/strapi-community/plugin-rest-cache/issues/175
   */
  cacheControl?: CacheControlConfig | CacheControlConfigInput;
  /**
   * The default hitpass for every content type and route that does not set its
   * own. The plugin ships one that bypasses the cache for any request carrying
   * an authorization or cookie header.
   *
   * Note this is consumed during resolution and deliberately not carried on the
   * resolved CachePluginStrategy: by the time resolution finishes, every route
   * holds its own effective hitpass, so a copy on the strategy could only
   * disagree with them.
   */
  hitpass?: CachePluginHitpass | boolean;
}
