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

  // Plugin routes are appended after every api route, so a path that already
  // matched an api route keeps matching that same route.
  return routes.concat(flattenPluginContentApiRoutes(strapi, apiPrefix));
};

/**
 * A plugin's router as it sits in `strapi.plugins[name].routes` during the
 * register phase: either a plain router object, or a router factory built by
 * `createContentApiRoutesFactory`, which is a function exposing its routes on a
 * `routes` property.
 */
type PluginRouter =
  | (RouteContainer & { type?: string; prefix?: string })
  | (((ctx: { strapi: Core.Strapi }) => { type?: string; prefix?: string }) & {
      routes?: FlattenedRoute[];
    });

/**
 * The content-api routes registered by plugins, with their global paths.
 *
 * Only strapi.apis used to be walked, so a route a plugin registers - the
 * documented `/api/users` of `plugin::users-permissions.user` in
 * docs/guide/caching/custom-routes.md ("Plugin routes") - was never found,
 * the recv middleware was never injected, and the route was silently left
 * uncached. Plugin content types have no default routes, so only routes a
 * configuration lists by hand can match here.
 *
 * Admin routers are deliberately skipped: they are not content API, and the
 * content-manager's admin routes are handled separately in injectMiddlewares.
 * The global path is built the way @strapi/core's register-routes and routing
 * build it: a route whose config has a `prefix` key at all is mounted straight
 * on the api router, any other route under the router's prefix, which defaults
 * to `/<plugin name>`.
 */
function flattenPluginContentApiRoutes(
  strapi: Core.Strapi,
  apiPrefix: string
): FlattenedRoute[] {
  const routes: FlattenedRoute[] = [];

  for (const [pluginName, plugin] of Object.entries(strapi.plugins)) {
    const routers = (plugin as { routes?: unknown }).routes;

    // The array form is always registered as an admin router.
    if (!routers || Array.isArray(routers) || typeof routers !== 'object') {
      continue;
    }

    for (const router of Object.values(routers as Record<string, PluginRouter>)) {
      // Only routes Strapi will register as these same objects can be used:
      // the middleware is injected by mutating them. A router factory shares
      // its route array between `.routes` and what it returns; a plain
      // function builds fresh routes on every call, so anything injected into
      // one call's routes would be lost.
      const routerRoutes = router?.routes;
      if (!Array.isArray(routerRoutes)) {
        continue;
      }

      const { type, prefix } =
        typeof router === 'function' ? (router({ strapi }) ?? {}) : router;

      if (type !== 'content-api') {
        continue;
      }

      const routerPrefix = prefix ?? `/${pluginName}`;

      for (const route of routerRoutes) {
        const ownPrefix =
          typeof route.config === 'object' &&
          route.config !== null &&
          Object.prototype.hasOwnProperty.call(route.config, 'prefix');

        route.globalPath = `${apiPrefix}${ownPrefix ? '' : routerPrefix}${
          route.path
        }` as RegisteredRoutePath;
        routes.push(route);
      }
    }
  }

  return routes;
}

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
