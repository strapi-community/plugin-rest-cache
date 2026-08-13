import { CacheKeysConfig } from './CacheKeysConfig';
import { CacheContentTypeConfig } from './CacheContentTypeConfig';
import { ms } from './common';
import type { Milliseconds } from './common';
import type { CachePluginStrategyInput } from './inputs';

export class CachePluginStrategy {
  debug: boolean = false;

  enableEtag: boolean = false;

  enableXCacheHeaders: boolean = false;

  enableAdminCTBMiddleware: boolean = true;

  enableDocumentServiceMiddleware: boolean = true;

  enableContentApiPurge: boolean = false;

  resetOnStartup: boolean = false;

  clearRelatedCache: boolean = false;

  /** Milliseconds. */
  maxAge: Milliseconds = ms(3600000);

  keysPrefix: string = '';

  contentTypes: CacheContentTypeConfig[] = [];

  keys: CacheKeysConfig;

  constructor(options: CachePluginStrategyInput = {}) {
    const {
      debug = false,
      enableEtag = false,
      enableXCacheHeaders = false,
      enableAdminCTBMiddleware = true,
      enableDocumentServiceMiddleware = true,
      enableContentApiPurge = false,
      resetOnStartup = false,
      clearRelatedCache = true,
      maxAge = 3600000,
      keysPrefix = '',
      contentTypes = [],
      keys = new CacheKeysConfig(),
    } = options;

    this.debug = debug;
    this.enableEtag = enableEtag;
    this.enableXCacheHeaders = enableXCacheHeaders;
    this.enableAdminCTBMiddleware = enableAdminCTBMiddleware;
    this.enableDocumentServiceMiddleware = enableDocumentServiceMiddleware;
    this.enableContentApiPurge = enableContentApiPurge;
    this.resetOnStartup = resetOnStartup;
    this.clearRelatedCache = clearRelatedCache;
    this.maxAge = ms(maxAge);
    this.keysPrefix = keysPrefix;
    this.contentTypes = contentTypes as CacheContentTypeConfig[];
    this.keys = keys instanceof CacheKeysConfig ? keys : new CacheKeysConfig(keys);
  }
}
