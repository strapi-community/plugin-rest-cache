import type { HttpMethod } from './common';

/** A policy entry as Strapi accepts it on a route's config. */
export type RoutePolicy =
  | string
  | { name: string; config: { actions: string[] } };

/**
 * A route this plugin registers.
 *
 * Exported rather than declared locally in each route file because the route
 * arrays are default-exported, and TypeScript cannot emit a declaration for an
 * export whose type is private to its module.
 */
export interface PluginRoute {
  method: HttpMethod;
  path: string;
  handler: string;
  config: {
    policies: RoutePolicy[];
  };
}
