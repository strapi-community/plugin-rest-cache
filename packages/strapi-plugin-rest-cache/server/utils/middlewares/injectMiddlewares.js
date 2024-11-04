'use strict';

const chalk = require('chalk');
const debug = require('debug')('strapi:strapi-plugin-rest-cache');
const { flattenRoutes } = require('./flattenRoutes');

const adminRoutes = {
  post: [
    '/single-types/:model/actions/publish',
    '/single-types/:model/actions/unpublish',
    '/collection-types/:model',
    '/collection-types/:model/:id/actions/publish',
    '/collection-types/:model/:id/actions/unpublish',
    '/collection-types/:model/actions/bulkDelete',
  ],
  put: ['/single-types/:model', '/collection-types/:model/:id'],
  delete: ['/single-types/:model', '/collection-types/:model/:id'],
};

function injectMiddleware(route, pluginUUid, config = {}) {
  if (typeof route.config === 'undefined') {
    route.config = {};
  }
  route['rest-cache-config'] = config;
  if (typeof route.config.middlewares === 'undefined') {
    route.config.middlewares = [
      {
        name: pluginUUid,
        config: config,
      },
    ];
  } else {
    route.config.middlewares.push({
      name: pluginUUid,
      config: config,
    });
  }
}

/**
 * @param {Strapi} strapi
 * @param {CachePluginStrategy} strategy
 * @return {void}
 */
function injectMiddlewares(strapi, strategy) {
  const strapiRoutes = flattenRoutes(strapi);

  for (const cacheConf of strategy.contentTypes) {
    debug(`[REGISTER] ${chalk.cyan(cacheConf.contentType)} routes middlewares`);
    for (const cacheRoute of cacheConf.routes) {
      const indexID = strapiRoutes.findIndex(
        (route) =>
          // You can modify this to search for a specific route or multiple
          route.method === cacheRoute.method &&
          //below replace removes the + at the end of the line
          route.globalPath === cacheRoute.path.replace(/\+$/, '')
      );

      // If the route exists lets inject the middleware
      if (indexID === -1) {
        debug(
          '[WARNING] route "[%s] %s" not registered in strapi, ignoring...',
          cacheRoute.method,
          cacheRoute.path
        );
      } else {
        switch (strapiRoutes[indexID].method) {
          case 'DELETE':
          case 'PUT':
          case 'PATCH':
          case 'POST':
            debug(
              `[REGISTER] ${cacheRoute.method} ${
                cacheRoute.path
              } ${chalk.redBright('purge')}`
            );
            injectMiddleware(
              strapiRoutes[indexID],
              'plugin::rest-cache.purge',
              {
                contentType: cacheConf.contentType,
              }
            );
            break;
          case 'GET': {
            const vary = cacheRoute.keys.useHeaders
              .map((name) => name.toLowerCase())
              .join(',');

            debug(
              `[REGISTER] GET ${cacheRoute.path} ${chalk.green(
                'recv'
              )} ${chalk.grey(`maxAge=${cacheRoute.maxAge}`)}${
                vary && chalk.grey(` vary=${vary}`)
              }`
            );
            injectMiddleware(strapiRoutes[indexID], 'plugin::rest-cache.recv', {
              cacheRouteConfig: cacheRoute,
            });
            break;
          }
          default:
            break;
        }
      }
    }
  }

  // --- Admin REST endpoints
  if (strategy.enableAdminCTBMiddleware) {
    debug(`[REGISTER] ${chalk.magentaBright('admin')} routes middlewares`);
    let contentMangerRoutes = [];
    for (const routes of Object.values(
      strapi.plugins['content-manager'].routes
    )) {
      for (const route of routes.routes) {
        contentMangerRoutes = contentMangerRoutes.concat(route);
      }
    }

    for (const route of adminRoutes.post) {
      const indexID = contentMangerRoutes.findIndex(
        (strapiRoute) =>
          // You can modify this to search for a specific route or multiple
          strapiRoute.method === 'POST' && strapiRoute.globalPath === route
      );
      if (indexID !== -1) {
        debug(`[REGISTER] POST ${route} ${chalk.magentaBright('purge-admin')}`);
        injectMiddleware(
          contentMangerRoutes[indexID],
          'plugin::rest-cache.purgeAdmin'
        );
      }
    }
    for (const route of adminRoutes.put) {
      const indexID = contentMangerRoutes.findIndex(
        (strapiRoute) =>
          // You can modify this to search for a specific route or multiple
          strapiRoute.method === 'PUT' && strapiRoute.globalPath === route
      );
      if (indexID !== -1) {
        debug(`[REGISTER] PUT ${route} ${chalk.magentaBright('purge-admin')}`);
        injectMiddleware(
          contentMangerRoutes[indexID],
          'plugin::rest-cache.purgeAdmin'
        );
      }
    }
    for (const route of adminRoutes.delete) {
      const indexID = contentMangerRoutes.findIndex(
        (strapiRoute) =>
          // You can modify this to search for a specific route or multiple
          strapiRoute.method === 'PUT' && strapiRoute.globalPath === route
      );
      if (indexID !== -1) {
        debug(
          `[REGISTER] DELETE ${route} ${chalk.magentaBright('purge-admin')}`
        );
        injectMiddleware(
          contentMangerRoutes[indexID],
          'plugin::rest-cache.purgeAdmin'
        );
      }
    }
  }
}

module.exports = {
  injectMiddlewares,
};
