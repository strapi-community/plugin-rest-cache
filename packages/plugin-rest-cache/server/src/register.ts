import type { Core } from '@strapi/strapi';
import debug from 'debug';

import { resolveUserStrategy } from './utils/config/resolveUserStrategy';
import { injectMiddlewares } from './utils/middlewares/injectMiddlewares';
import { registerDocumentServiceMiddleware } from './utils/middlewares/registerDocumentServiceMiddleware';
import type { RestCachePluginConfig } from './types/config';

export default async function register({ strapi }: { strapi: Core.Strapi }) {
  // resolve user configuration, check for missing or invalid optinos
  const pluginOption = strapi.config.get<RestCachePluginConfig>('plugin::rest-cache');
  const cacheStore = strapi.plugin('rest-cache').service('cacheStore');

  if (pluginOption.strategy.debug === true) {
    debug.enable('strapi:plugin-rest-cache');
  }

  const strategy = resolveUserStrategy(strapi, pluginOption.strategy);
  strapi.config.set('plugin::rest-cache', {
    ...pluginOption,
    strategy,
  });

  debug('strapi:plugin-rest-cache')('[STRATEGY]: %O', strategy);

  // boostrap cache middlewares
  injectMiddlewares(strapi, strategy);

  // Invalidation. The document service hook supersedes the route-injected
  // purge middlewares, so the two are mutually exclusive - running both would
  // purge twice for every write that does go through a route.
  if (strategy.enableDocumentServiceMiddleware) {
    registerDocumentServiceMiddleware(strapi);
  }

  if (strategy.resetOnStartup) {
    strapi.log.warn('Reset cache on startup is enabled');
    await cacheStore.reset();
  }
}
