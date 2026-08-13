'use strict';

/**
 * @typedef {import('@strapi/strapi').Strapi} Strapi
 * @typedef {import('koa').Context} Context
 */

/**
 * @param {{ strapi: Strapi }} strapi
 */
export default function createPurgeController({ strapi }) {
  /**
   * @param {Context} ctx
   */
  async function purge(ctx) {
    const { contentType, params, wildcard } = ctx.request.body ?? {};

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
     *
     * @param {Context} ctx
     */
    async index(ctx) {
      return purge(ctx);
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
     * @param {Context} ctx
     */
    async contentApi(ctx) {
      const { strategy } = strapi.config.get('plugin::rest-cache');

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
