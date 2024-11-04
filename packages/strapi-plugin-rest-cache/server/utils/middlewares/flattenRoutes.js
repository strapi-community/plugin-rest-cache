'use strict';

/**
 * @param {Strapi} strapi
 * @return {void}
 */

function flattenRoutes(strapi) {
  let routes = [];
  for (const contentTypes of Object.values(strapi.api)) {
    routes = routes.concat(flatten(contentTypes));
  }
  // @TODO add prefix support before doing this
  
  const apiPrefix = strapi.config.get('api.rest.prefix');

  for (const route of routes) {
    route.globalPath = `/${apiPrefix}${route.path}`;
  }
  return routes;
}

function flatten(routes) {
  let returnRoutes = [];
  if (Array.isArray(routes)) {
    return routes;
  }
  if (Array.isArray(routes.routes)) {
    return routes.routes;
  }
  for (const route of Object.values(routes.routes)) {
    returnRoutes = returnRoutes.concat(flatten(route));
  }
  return returnRoutes;
}

module.exports = {
  flattenRoutes,
};
