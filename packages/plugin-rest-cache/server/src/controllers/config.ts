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

      // Deliberately not the whole provider config. `options` is handed
      // straight to the adapter, and for redis that is where connection
      // details live - @keyv/redis accepts a full
      // "redis://user:password@host" URI there. Nothing in the admin panel
      // needs it, and holding cache.read-provider does not make someone an
      // operator entitled to infrastructure credentials.
      //
      // Allow-list rather than deleting `options`, so a provider config that
      // grows a new field does not start leaking it by default.
      ctx.body = {
        provider: {
          name: provider?.name,
          getTimeout: provider?.getTimeout,
        },
      };
    },

    /**
     * Snapshot of what the cache currently holds, for the admin dashboard.
     */
    async stats(ctx: Context) {
      ctx.body = await strapi.plugin('rest-cache').service('cacheStats').summary();
    },
  };
}
