import type { Core } from '@strapi/strapi';

import { getRelatedModelsUid } from './getRelatedModelsUid';
import { deepFreeze } from './deepFreeze';
import {
  CachePluginStrategy,
  CacheRouteConfig,
  CacheContentTypeConfig,
  CacheKeysConfig,
} from '../../types';
import type {
  CacheContentTypeConfigInput,
  CachePluginStrategyInput,
  CacheRouteConfigInput,
} from '../../types/inputs';
import type { HttpMethod } from '../../types/common';

const routeParamNameRegex = /:([^/]+)/g;
const routeParams = /(?<=\/\:).*?(?=\/|$)/g;

/**
 * A cache config part-way through resolution.
 *
 * Distinct from CacheContentTypeConfig because it is assembled in stages -
 * routes are pushed, then `singleType`, `plugin` and `relatedContentTypeUid`
 * are computed from the content type - and is only complete enough to be a
 * CacheContentTypeConfig at the very end. Typing it as the finished class would
 * have claimed those fields were populated while they were still undefined.
 */
interface DraftContentTypeConfig extends CacheContentTypeConfigInput {
  contentType: string;
  routes: CacheRouteConfig[];
  keys: CacheKeysConfig;
}

/**
 * Extract the API name from a content type uid.
 *
 * "api::writer.editor" -> "writer"
 */
function getApiNameFromUid(uid: string): string {
  return uid.split('::')[1]?.split('.')[0];
}

export const resolveUserStrategy = function (
  strapi: Core.Strapi,
  userOptions: CachePluginStrategyInput
): CachePluginStrategy {
  const { contentTypes = [] } = userOptions;

  const cacheConfigs: DraftContentTypeConfig[] = [];

  const defaultModelConfig = {
    singleType: false,
    injectDefaultRoutes: true,
    keys: userOptions.keys,
    hitpass: userOptions.hitpass,
    maxAge: userOptions.maxAge,
  };

  // Creating cache Config
  for (const contentTypeOption of contentTypes as Array<
    string | CacheContentTypeConfigInput
  >) {
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
    const routes: CacheRouteConfig[] = [];
    const contentTypeKeys = contentTypeOption?.keys ?? defaultModelConfig.keys;

    (
      contentTypeOption.routes as Array<string | CacheRouteConfigInput> | undefined
    )?.reduce((acc, value) => {
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
            paramNames: (value.path.match(routeParamNameRegex) ?? []).map((param) =>
              param.replace(':', '')
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
      contentType: contentTypeOption.contentType,
      routes,
      keys: new CacheKeysConfig(contentTypeKeys),
    });
  }

  for (const cacheConfig of cacheConfigs) {
    // validate contentTypes
    const contentType = strapi.contentType(cacheConfig.contentType as never);
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
    const apiPrefix = strapi.config.get('api.rest.prefix') as string;

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
                method: route.method as HttpMethod,
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
                method: route.method as HttpMethod,
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
                method: route.method as HttpMethod,
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
          "so one user's response can be served to another. Set keys: { useAuth: true } for this " +
          'contentType, or leave hitpass enabled.'
      );
    }
  }

  // `cacheControl.scope: "public"` invites shared caches to reuse a response for
  // anybody, which contradicts keying entries per caller. The emitter downgrades
  // those routes to "private" itself - this is not something an operator gets to
  // misconfigure into a leak - but say so at boot, because an unannounced
  // downgrade otherwise shows up as a CDN that inexplicably declines to cache.
  // See https://github.com/strapi-community/plugin-rest-cache/issues/175
  if (
    userOptions.cacheControl?.enabled &&
    userOptions.cacheControl.scope === 'public'
  ) {
    for (const cacheConfig of cacheConfigs) {
      const keyedPerCaller = cacheConfig.routes.filter(
        (route) => route.keys?.useAuth === true
      );

      if (!keyedPerCaller.length) {
        continue;
      }

      strapi.log.warn(
        `REST Cache: cacheControl.scope is "public" but "${cacheConfig.contentType}" keys entries per caller ` +
          `on ${keyedPerCaller.length} route(s) (keys.useAuth). Those responses are caller-specific, and a shared ` +
          "cache told they are public could serve one caller's response to another. Emitting \"private\" for them " +
          'instead.'
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
  ) as CachePluginStrategy;
};
