import type { Core } from '@strapi/strapi';

import { getRouteRegExp } from '../utils/config/getRouteRegExp';
import type { CacheContentTypeConfig } from '../types';
import type { ContentTypeUID } from '../types/common';
import type { RestCachePluginConfig } from '../types/config';

type Uid = ContentTypeUID | string;
type RouteParams = Record<string, string | number>;

/**
 * Read access to the resolved strategy.
 *
 * Declared explicitly because every method reaches other members through
 * `this`, which is circular for inference.
 */
export interface CacheConfigService {
  getUids(): string[];
  getRelatedCachedUid(uid: Uid): string[];
  get(uid: Uid): CacheContentTypeConfig | undefined;
  getCacheKeysRegexp(uid: Uid, params?: RouteParams, wildcard?: boolean): RegExp[];
  isCached(uid: Uid): boolean;
  /** @deprecated use cacheStore.clearByUid instead */
  clearCache(uid: Uid, params?: RouteParams, wildcard?: boolean): Promise<void>;
}

export default function createCacheConfigService({
  strapi,
}: {
  strapi: Core.Strapi;
}): CacheConfigService {
  return {
    /**
     * Get all uid of cached contentTypes
     *
     * uid:
     * - api::sport.sport
     * - plugin::users-permissions.user
     */
    getUids() {
      const { strategy } =
        strapi.config.get<RestCachePluginConfig>('plugin::rest-cache');
      return strategy.contentTypes.map((cacheConf) => cacheConf.contentType);
    },

    /**
     * Return the intersection of cached contentTypes and the related contentTypes of a given contentType uid
     *
     * uid:
     * - api::sport.sport
     * - plugin::users-permissions.user
     */
    getRelatedCachedUid(uid) {
      const cacheConf = this.get(uid);
      if (!cacheConf) {
        return [];
      }

      const cached = this.getUids();
      const related = cacheConf.relatedContentTypeUid;

      return related.filter((relatedUid) => cached.includes(relatedUid));
    },

    /**
     * Get related ModelCacheConfig with an uid
     *
     * uid:
     * - api::sport.sport
     * - plugin::users-permissions.user
     */
    get(uid) {
      const { strategy } =
        strapi.config.get<RestCachePluginConfig>('plugin::rest-cache');
      return strategy.contentTypes.find((cacheConf) => cacheConf.contentType === uid);
    },

    /**
     * Get regexs to match all ModelCacheConfig keys with given params
     */
    getCacheKeysRegexp(uid, params, wildcard = false) {
      const cacheConf = this.get(uid);
      if (!cacheConf) {
        return [];
      }

      const regExps: RegExp[] = [];

      const routes = cacheConf.routes.filter((route) => route.method === 'GET');

      for (const route of routes) {
        regExps.push(...getRouteRegExp(route, params, wildcard));
      }

      return regExps;
    },

    /**
     * Check if a cache configuration exists for a contentType uid
     *
     * uid:
     * - api::sport.sport
     * - plugin::users-permissions.user
     */
    isCached(uid) {
      return !!this.get(uid);
    },

    /**
     * @deprecated use strapi.plugin('rest-cache').service('cacheStore').clearByUid instead
     */
    async clearCache(uid, params = {}, wildcard = false) {
      strapi.log.warn(
        'REST Cache cacheConfig.clearCache is deprecated, use cacheStore.clearByUid instead'
      );
      strapi.plugin('rest-cache').service('cacheStore').clearByUid(uid, params, wildcard);
    },
  };
}
