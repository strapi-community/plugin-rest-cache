'use strict';

/**
 * @typedef {import('koa').Context} Context
 * @typedef {import('@strapi/strapi').Strapi} Strapi
 */

import { getRelatedModelsUid } from './getRelatedModelsUid';
import { deepFreeze } from './deepFreeze';
import {
  CachePluginStrategy,
  CacheRouteConfig,
  CacheContentTypeConfig,
  CacheKeysConfig,
} from '../../types';

const routeParamNameRegex = /:([^/]+)/g;
const routeParams = /(?<=\/\:).*?(?=\/|$)/g;

/**
 * Extract the API name from a content type uid.
 *
 * "api::writer.editor" -> "writer"
 *
 * @param {string} uid
 * @return {string}
 */
function getApiNameFromUid(uid) {
  return uid.split('::')[1]?.split('.')[0];
}

/**
 * @param {Strapi} strapi
 * @param {any} userOptions
 * @return {CachePluginStrategy}
 */
export const resolveUserStrategy = function (strapi, userOptions) {
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

    // Resolve the owning API from the uid rather than from the content type's
    // singular name. A content type does not have to be named after the API it
    // lives in - "api::writer.editor" is registered under strapi.apis.writer,
    // not strapi.apis.editor - and using the singular name means such content
    // types either resolve to the wrong API or, more often, crash the whole
    // application at register time with "Cannot read properties of undefined".
    // See https://github.com/strapi-community/plugin-rest-cache/issues/125
    const apiName = getApiNameFromUid(cacheConfig.contentType);
    const api = strapi.apis[apiName];

    if (!api) {
      throw new Error(
        `Unable to resolve rest-cache options: no API "${apiName}" found for contentType "${cacheConfig.contentType}". ` +
          `Set "injectDefaultRoutes: false" for this contentType if it has no default routes.`
      );
    }

    for (const routes of Object.values(api.routes)) {
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
                path: `${apiPrefix}${route.path}`,
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
                path: `${apiPrefix}${route.path}`,
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
                path: `${apiPrefix}${route.path}`,
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

  // Caching authenticated responses without keying on the caller means two
  // people authorised for the same route share one entry. Whoever misses first
  // decides what everybody else sees.
  //
  // This is only reachable deliberately - the default hitpass skips anything
  // carrying an authorization or cookie header - so warn rather than refuse,
  // but warn loudly and name the content type.
  // See https://github.com/strapi-community/plugin-rest-cache/issues/113
  for (const cacheConfig of cacheConfigs) {
    const cachesAuthenticated = cacheConfig.hitpass === false;
    const keysAuthIdentity = cacheConfig.keys?.useAuth === true;

    if (cachesAuthenticated && !keysAuthIdentity) {
      strapi.log.warn(
        `REST Cache: "${cacheConfig.contentType}" has hitpass disabled but keys.useAuth is not set. ` +
          'Authenticated responses will be cached under a key that does not identify the caller, ' +
          'so one user\'s response can be served to another. Set keys: { useAuth: true } for this ' +
          'contentType, or leave hitpass enabled.'
      );
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
