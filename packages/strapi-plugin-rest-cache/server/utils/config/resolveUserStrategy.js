'use strict';

/**
 * @typedef {import('koa').Context} Context
 * @typedef {import('@strapi/strapi').Strapi} Strapi
 */

const { getRelatedModelsUid } = require('./getRelatedModelsUid');
const { deepFreeze } = require('./deepFreeze');
const {
  CachePluginStrategy,
  CacheRouteConfig,
  CacheContentTypeConfig,
  CacheKeysConfig,
} = require('../../types');

const routeParamNameRegex = /:([^/]+)/g;
const routeParams = /(?<=\/\:).*?(?=\/|$)/g;

/**
 * @param {Strapi} strapi
 * @param {any} userOptions
 * @return {CachePluginStrategy}
 */
function resolveUserStrategy(strapi, userOptions) {
  const { contentTypes = [] } = userOptions;

  /**
   * @type {CacheContentTypeConfig[]}
   */
  const cacheConfigs = [];

  const defaultModelConfig = {
    singleType: false,
    injectDefaultRoutes: true,
    keys: userOptions.keys,
    hitpass: userOptions.hitpass,
    maxAge: userOptions.maxAge,
  };

  // Creating cache Config
  for (const contentTypeOption of contentTypes) {
    // string
    if (typeof contentTypeOption === 'string') {
      cacheConfigs.push({
        ...defaultModelConfig,
        routes: [],
        contentType: contentTypeOption,
        keys: new CacheKeysConfig(defaultModelConfig.keys),
      });
      continue;
    }

    // Object
    /**
     * @type {CacheRouteConfig[]}
     */
    const routes = [];
    const contentTypeKeys = contentTypeOption?.keys ?? defaultModelConfig.keys;

    contentTypeOption.routes?.reduce((acc, value) => {
      if (typeof value === 'string') {
        acc.push(
          new CacheRouteConfig({
            path: value,
            method: 'GET',
            keys: new CacheKeysConfig(contentTypeKeys),
            maxAge: defaultModelConfig.maxAge,
            hitpass: defaultModelConfig.hitpass,
            paramNames: (value.match(routeParamNameRegex) ?? []).map((param) =>
              param.replace(':', '')
            ),
          })
        );
      } else {
        // @TODO get the route of the value maby replace route with handler.
        acc.push(
          new CacheRouteConfig({
            maxAge: defaultModelConfig.maxAge,
            hitpass: defaultModelConfig.hitpass,
            paramNames: (value.path.match(routeParamNameRegex) ?? []).map(
              (param) => param.replace(':', '')
            ),
            ...value,
            keys: value.keys
              ? new CacheKeysConfig(value.keys)
              : new CacheKeysConfig(contentTypeKeys),
          })
        );
      }

      return acc;
    }, routes);

    cacheConfigs.push({
      ...defaultModelConfig,
      ...contentTypeOption,
      routes,
      keys: new CacheKeysConfig(contentTypeKeys),
    });
  }

  for (const cacheConfig of cacheConfigs) {
    // validate contentTypes
    const contentType = strapi.contentType(cacheConfig.contentType);
    if (!contentType) {
      throw new Error(
        `Unable to resolve rest-cache options: contentType uid "${cacheConfig.contentType}" not found`
      );
    }

    // compute contentType kind, plugin, relationship
    cacheConfig.singleType = Boolean(contentType.kind === 'singleType');
    cacheConfig.plugin = contentType.plugin;
    cacheConfig.relatedContentTypeUid = getRelatedModelsUid(
      strapi,
      cacheConfig.contentType
    );

    // inject defaults api routes
    if (!cacheConfig.injectDefaultRoutes) {
      continue;
    }
    // plugins does not have defaults routes
    if (cacheConfig.plugin) {
      continue;
    }

    // get strapi api prefix
    const apiPrefix = strapi.config.get('api.rest.prefix');

    for (const routes of Object.values(
      strapi.api[contentType.info.singularName].routes
    )) {
      for (const route of routes.routes) {
        // @TODO remove path and method and use the one
        if (cacheConfig.singleType === true) {
          const singleTypeMethod = ['GET', 'PUT', 'DELETE'];
          if (
            singleTypeMethod.includes(route.method) &&
            route.path === `/${contentType.info.singularName}`
          ) {
            cacheConfig.routes.push(
              new CacheRouteConfig({
                path: `/${apiPrefix}${route.path}`,
                paramNames: route.path.match(routeParams) ?? [],
                method: route.method,
                keys: new CacheKeysConfig(cacheConfig.keys),
                maxAge: cacheConfig.maxAge,
                hitpass: cacheConfig.hitpass,
              })
            );
          }
        } else {
          const CollectionTypeMethod = ['GET', 'POST'];
          const CollectionTypeIdMethod = ['GET', 'PUT', 'DELETE'];
          if (
            CollectionTypeMethod.includes(route.method) &&
            route.path === `/${contentType.info.pluralName}`
          ) {
            cacheConfig.routes.push(
              new CacheRouteConfig({
                path: `/${apiPrefix}${route.path}`,
                paramNames: route.path.match(routeParams) ?? [],
                method: route.method,
                keys: new CacheKeysConfig(cacheConfig.keys),
                maxAge: cacheConfig.maxAge,
                hitpass: cacheConfig.hitpass,
              })
            );
          }
          if (
            CollectionTypeIdMethod.includes(route.method) &&
            route.path === `/${contentType.info.pluralName}/:id`
          ) {
            cacheConfig.routes.push(
              new CacheRouteConfig({
                path: `/${apiPrefix}${route.path}`,
                paramNames: route.path.match(routeParams) ?? [],
                method: route.method,
                keys: new CacheKeysConfig(cacheConfig.keys),
                maxAge: cacheConfig.maxAge,
                hitpass: cacheConfig.hitpass,
              })
            );
          }
        }
      }
    }
  }

  return deepFreeze(
    new CachePluginStrategy({
      ...userOptions,
      keys: new CacheKeysConfig(userOptions.keys),
      contentTypes: cacheConfigs.map(
        (cacheConfig) => new CacheContentTypeConfig(cacheConfig)
      ),
    })
  );
}

module.exports = { resolveUserStrategy };
