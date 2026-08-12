'use strict';

import chalk from 'chalk';
import debug from 'debug';
import { flattenRoutes } from './flattenRoutes';

// Content-manager routes that mutate content and therefore must purge the cache.
// Keep in sync with packages/core/content-manager/server/src/routes/admin.ts in
// strapi/strapi. Note that `/collection-types/:model/actions/bulkFindForValidation`
// is deliberately absent: despite being a POST it is a read operation, so purging
// on it would cause spurious cache flushes.
const adminRoutes = {
  post: [
    '/single-types/:model/actions/publish',
    '/single-types/:model/actions/unpublish',
    '/single-types/:model/actions/discard',
    '/collection-types/:model',
    '/collection-types/:model/clone/:sourceId',
    '/collection-types/:model/auto-clone/:sourceId',
    '/collection-types/:model/actions/publish',
    '/collection-types/:model/:id/actions/publish',
    '/collection-types/:model/:id/actions/unpublish',
    '/collection-types/:model/:id/actions/discard',
    '/collection-types/:model/actions/bulkDelete',
    '/collection-types/:model/actions/bulkPublish',
    '/collection-types/:model/actions/bulkUnpublish',
  ],
  put: ['/single-types/:model', '/collection-types/:model/:id'],
  delete: ['/single-types/:model', '/collection-types/:model/:id'],
};

/**
 * Strip the trailing "+" repeatable-param marker so a configured route path and
 * the path Strapi registered compare equal.
 *
 * @param {string} path
 * @return {string}
 */
function normalizeRoutePath(path) {
  return (path || '').replace(/\+$/, '');
}

function injectMiddleware(route, pluginUUid, config = {}) {
  if (typeof route.config === 'undefined') {
    route.config = {};
  }
  if (typeof route.config.middlewares === 'undefined') {
    route.config.middlewares = [
      {
        name: pluginUUid,
        config: config,
      },
    ];
  } else {
    const index = route.config.middlewares.findIndex((middleware) => {
      return middleware === pluginUUid || typeof middleware === 'object' && middleware.name === pluginUUid
    })

    if(index === -1){
      route.config.middlewares.push({
        name: pluginUUid,
        config: config,
      });
      return
    }
    route.config.middlewares[index] = {
      name: pluginUUid,
      config: config,
    }
  }
}

/**
 * @param {Strapi} strapi
 * @param {CachePluginStrategy} strategy
 * @return {void}
 */
export const injectMiddlewares = function (strapi, strategy) {
  const strapiRoutes = flattenRoutes(strapi);

  // When invalidation runs off the document service it already covers every
  // write, including those that never reach a route. Injecting the route purge
  // middlewares as well would purge twice for every routed write.
  const purgeViaDocumentService = Boolean(strategy.enableDocumentServiceMiddleware);

  for (const cacheConf of strategy.contentTypes) {
    debug('strapi:plugin-rest-cache')(`[REGISTER] ${chalk.cyan(cacheConf.contentType)} routes middlewares`);
    for (const cacheRoute of cacheConf.routes) {
      const indexID = strapiRoutes.findIndex(
        (route) =>
          // You can modify this to search for a specific route or multiple
          route.method === cacheRoute.method &&
          // Normalise both sides: a trailing "+" marks a repeatable param
          // (e.g. "/categories/slug/:slug+") and is part of the registered
          // path as well as the configured one. Stripping it from only one
          // side means such routes never match, and are silently left
          // uncached.
          normalizeRoutePath(route.globalPath) === normalizeRoutePath(cacheRoute.path)
      );

      // If the route exists lets inject the middleware
      if (indexID === -1) {
        debug('strapi:plugin-rest-cache')(
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
            if (purgeViaDocumentService) {
              break;
            }
            debug('strapi:plugin-rest-cache')(
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

            debug('strapi:plugin-rest-cache')(
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
  // Superseded by the document service middleware, which sees content-manager
  // writes (and bulk actions, clones and discards) without needing this list.
  if (strategy.enableAdminCTBMiddleware && !purgeViaDocumentService) {
    debug('strapi:plugin-rest-cache')(`[REGISTER] ${chalk.magentaBright('admin')} routes middlewares`);
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
          strapiRoute.method === 'POST' && strapiRoute.path === route
      );
      if (indexID !== -1) {
        debug('strapi:plugin-rest-cache')(`[REGISTER] POST ${route} ${chalk.magentaBright('purge-admin')}`);
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
          strapiRoute.method === 'PUT' && strapiRoute.path === route
      );
      if (indexID !== -1) {
        debug('strapi:plugin-rest-cache')(`[REGISTER] PUT ${route} ${chalk.magentaBright('purge-admin')}`);
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
          strapiRoute.method === 'DELETE' && strapiRoute.path === route
      );
      if (indexID !== -1) {
        debug('strapi:plugin-rest-cache')(
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
