import type { Context } from 'koa';
import type { Core } from '@strapi/strapi';

import type { RestCachePluginConfig } from '../types/config';

export default function createConfigController({ strapi }: { strapi: Core.Strapi }) {
  return {
    async strategy(ctx: Context) {
      const { strategy } = strapi.config.get<RestCachePluginConfig>('plugin::rest-cache');
      ctx.body = { strategy };
    },

    async provider(ctx: Context) {
      const { provider } = strapi.config.get<RestCachePluginConfig>('plugin::rest-cache');
      ctx.body = { provider };
    },

    /**
     * Snapshot of what the cache currently holds, for the admin dashboard.
     */
    async stats(ctx: Context) {
      ctx.body = await strapi.plugin('rest-cache').service('cacheStats').summary();
    },
  };
}
