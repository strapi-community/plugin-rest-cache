'use strict';

const { CacheControlHeaderConfig } = require('./CacheControlHeaderConfig');
/**
 * @typedef {import('./CacheContentTypeConfig').CacheContentTypeConfig} CacheContentTypeConfig
 * @typedef {import('./CacheControlHeaderConfig').CacheControlHeaderConfig} CacheControlHeaderConfig
 */
const { CacheKeysConfig } = require('./CacheKeysConfig');

class CachePluginStrategy {
  debug = false;

  enableEtag = false;

  enableXCacheHeaders = false;

  enableAdminCTBMiddleware = true;

  resetOnStartup = false;

  clearRelatedCache = false;

  maxAge = 3600000;

  keysPrefix = '';

  /**
   * @type {CacheContentTypeConfig[]}
   */
  contentTypes = [];

  /**
   * @type {CacheKeysConfig}
   */
  keys;

  /**
   * @param {CacheControlHeaderConfig}
   */
  cacheControlHeader;

  constructor(options = {}) {
    const {
      debug = false,
      enableEtag = false,
      enableXCacheHeaders = false,
      enableAdminCTBMiddleware = true,
      resetOnStartup = false,
      clearRelatedCache = true,
      maxAge = 3600000,
      keysPrefix = '',
      contentTypes = [],
      keys = new CacheKeysConfig(),
      cacheControlHeader = new CacheControlHeaderConfig(),
    } = options;

    this.debug = debug;
    this.enableEtag = enableEtag;
    this.enableXCacheHeaders = enableXCacheHeaders;
    this.enableAdminCTBMiddleware = enableAdminCTBMiddleware;
    this.resetOnStartup = resetOnStartup;
    this.clearRelatedCache = clearRelatedCache;
    this.maxAge = maxAge;
    this.keysPrefix = keysPrefix;
    this.contentTypes = contentTypes;
    this.keys = keys;
    this.cacheControlHeader = cacheControlHeader;
  }
}

module.exports = { CachePluginStrategy };
