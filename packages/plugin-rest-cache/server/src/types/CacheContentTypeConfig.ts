import { CacheKeysConfig } from './CacheKeysConfig';
import { CacheRouteConfig } from './CacheRouteConfig';
import { ms } from './common';
import type { CachePluginHitpass, ContentTypeUID, Milliseconds } from './common';
import type { CacheContentTypeConfigInput } from './inputs';

export class CacheContentTypeConfig {
  singleType: boolean = false;

  injectDefaultRoutes: boolean = true;

  /**
   * Milliseconds.
   *
   * This defaulted to the boolean `true` here while the class field said
   * 3600000, which through the provider became a one second TTL. The
   * Milliseconds brand exists so that cannot recur.
   *
   * @see https://github.com/strapi-community/plugin-rest-cache/issues/126
   */
  maxAge: Milliseconds = ms(3600000);

  hitpass: CachePluginHitpass | boolean = false;

  keys: CacheKeysConfig;

  plugin?: string;

  routes: CacheRouteConfig[] = [];

  contentType: ContentTypeUID;

  relatedContentTypeUid: string[] = [];

  constructor(options: CacheContentTypeConfigInput = {}) {
    const {
      singleType = false,
      injectDefaultRoutes = true,
      maxAge = 3600000,
      hitpass = false,
      keys = new CacheKeysConfig(),
      routes = [],
      relatedContentTypeUid = [],
      contentType,
      plugin,
    } = options;

    this.singleType = singleType;
    this.injectDefaultRoutes = injectDefaultRoutes;
    this.maxAge = ms(maxAge);
    this.hitpass = hitpass;
    this.keys = keys instanceof CacheKeysConfig ? keys : new CacheKeysConfig(keys);
    this.routes = routes.map((route) =>
      route instanceof CacheRouteConfig ? route : new CacheRouteConfig(route)
    );
    this.relatedContentTypeUid = relatedContentTypeUid;
    this.contentType = contentType as ContentTypeUID;
    this.plugin = plugin;
  }
}
