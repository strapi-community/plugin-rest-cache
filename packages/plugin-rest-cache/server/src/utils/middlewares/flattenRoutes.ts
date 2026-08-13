import type { Core } from '@strapi/strapi';

import type { HttpMethod, RegisteredRoutePath } from '../../types/common';

/**
 * A route as Strapi registered it, with the api prefix resolved onto it.
 *
 * `path` is the route's own path ("/articles"); `globalPath` is the path a
 * request actually arrives on ("/api/articles"). Configured cache routes are
 * written in the latter form, so comparing against `path` silently matches
 * nothing.
 */
export interface FlattenedRoute {
  method: HttpMethod;
  path: string;
  globalPath?: RegisteredRoutePath;
  handler?: unknown;
  config?: unknown;
}

interface RouteContainer {
  routes?: FlattenedRoute[] | Record<string, RouteContainer>;
}

export const flattenRoutes = function (strapi: Core.Strapi): FlattenedRoute[] {
  let routes: FlattenedRoute[] = [];
  for (const contentTypes of Object.values(strapi.apis)) {
    routes = routes.concat(flatten(contentTypes as unknown as RouteContainer));
  }
  // @TODO add prefix support before doing this

  const apiPrefix = strapi.config.get('api.rest.prefix') as string;

  for (const route of routes) {
    route.globalPath = `${apiPrefix}${route.path}` as RegisteredRoutePath;
  }
  return routes;
};

function flatten(routes: RouteContainer | FlattenedRoute[]): FlattenedRoute[] {
  let returnRoutes: FlattenedRoute[] = [];
  if (Array.isArray(routes)) {
    return routes;
  }
  if (Array.isArray(routes.routes)) {
    return routes.routes;
  }
  for (const route of Object.values(routes.routes ?? {})) {
    returnRoutes = returnRoutes.concat(flatten(route));
  }
  return returnRoutes;
}
