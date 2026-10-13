import type { Context } from 'koa';
import type { Core } from '@strapi/strapi';

import type { CachePluginStrategy, ContentTypeUID } from '../types';
import type { PurgeableContentTypesResponse } from '../types/api';

/**
 * The purge payload. Koa does not type the parsed body, and it is unvalidated
 * user input in any case, so every field is optional here.
 */
interface PurgeRequestBody {
  contentType?: ContentTypeUID;
  params?: Record<string, unknown>;
  wildcard?: boolean;
}

type PurgeContext = Context & { request: { body?: PurgeRequestBody } };

interface RestCachePluginConfig {
  strategy: CachePluginStrategy;
}

export default function createPurgeController({ strapi }: { strapi: Core.Strapi }) {
  async function purge(ctx: Context) {
    const { contentType, params, wildcard } = (ctx as PurgeContext).request.body ?? {};

    if (!contentType) {
      ctx.badRequest('contentType is required');
      return;
    }

    const cacheConfigService = strapi.plugin('rest-cache').service('cacheConfig');
    const cacheStoreService = strapi.plugin('rest-cache').service('cacheStore');

    if (!cacheConfigService.isCached(contentType)) {
      ctx.badRequest('contentType is not cached', { contentType });
      return;
    }

    await cacheStoreService.clearByUid(contentType, params, wildcard);

    // send no-content status
    // ctx.status = 204;
    ctx.body = {};
  }

  return {
    /**
     * Admin endpoint, behind admin authentication and the cache.purge
     * permission. Always available.
     */
    async index(ctx: Context) {
      return purge(ctx);
    },

    /**
     * The uids of the cached content types, and nothing else.
     *
     * The admin's purge controls read the strategy to decide whether to
     * render, but the strategy is behind cache.read-strategy. An admin granted
     * only cache.purge got a 403 there and so was never offered the control
     * the permission exists for. This is what they fall back to.
     */
    async contentTypes(ctx: Context) {
      const body: PurgeableContentTypesResponse = {
        contentTypes: strapi.plugin('rest-cache').service('cacheConfig').getUids(),
      };

      ctx.body = body;
    },

    /**
     * Content API endpoint, for purging from outside the admin panel - a
     * deploy pipeline, a webhook from an upstream system, a scheduled job.
     *
     * Off by default. Purging is destructive and cheap to trigger, so exposing
     * it on the public API surface has to be a deliberate choice rather than
     * something that appears when you upgrade.
     *
     * @see https://github.com/strapi-community/plugin-rest-cache/issues/99
     */
    async contentApi(ctx: Context) {
      const { strategy } = strapi.config.get<RestCachePluginConfig>('plugin::rest-cache');

      if (!strategy.enableContentApiPurge) {
        // 404 rather than 403: when the feature is off the endpoint should not
        // announce that it exists.
        ctx.notFound();
        return;
      }

      return purge(ctx);
    },
  };
}
