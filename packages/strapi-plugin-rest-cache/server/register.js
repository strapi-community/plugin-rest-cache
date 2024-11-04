'use strict';

/**
 * @typedef {import('@strapi/strapi').Strapi} Strapi
 */
const debug = require('debug');

const { resolveUserStrategy } = require('./utils/config/resolveUserStrategy');
const { injectMiddlewares } = require('./utils/middlewares/injectMiddlewares');

/**
 * @param {{ strapi: Strapi }} strapi
 */
async function register({ strapi }) {
  // resolve user configuration, check for missing or invalid optinos
  const pluginOption = strapi.config.get('plugin.rest-cache');
  const cacheStore = strapi.plugin('rest-cache').service('cacheStore');

  if (pluginOption.strategy.debug === true) {
    debug.enable('strapi:strapi-plugin-rest-cache');
  }

  const strategy = resolveUserStrategy(strapi, pluginOption.strategy);
  strapi.config.set('plugin.rest-cache', {
    ...pluginOption,
    strategy,
  });

  debug('strapi:strapi-plugin-rest-cache')('[STRATEGY]: %O', strategy);

  // boostrap cache middlewares
  injectMiddlewares(strapi, strategy);

  if (strategy.resetOnStartup) {
    strapi.log.warn('Reset cache on startup is enabled');
    await cacheStore.reset();
  }
}

module.exports = {
  register,
};
