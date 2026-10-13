import type { PluginRoute } from '../../types/routes';
import pluginId from '../../pluginId';

const purgeRoutes: PluginRoute[] = [
  {
    method: 'POST',
    path: '/purge',
    handler: 'purge.index',
    config: {
      policies: [
        'admin::isAuthenticatedAdmin',
        {
          name: 'plugin::content-manager.hasPermissions',
          config: { actions: [`plugin::${pluginId}.cache.purge`] },
        },
      ],
    },
  },
  {
    // What the purge controls need in order to decide whether to render, for
    // an admin who may purge but may not read the strategy. Gated by the same
    // permission as the purge itself, and returns nothing that permission
    // does not already reveal: POST /purge answers 400 for any uid that is not
    // cached, so the list is discoverable from it one uid at a time.
    //
    // GET /config/strategy stays behind cache.read-strategy. It carries the
    // whole resolved strategy - hitpass, keys, routes - which is more than
    // someone allowed to purge needs to see.
    method: 'GET',
    path: '/purge/content-types',
    handler: 'purge.contentTypes',
    config: {
      policies: [
        'admin::isAuthenticatedAdmin',
        {
          name: 'plugin::content-manager.hasPermissions',
          config: { actions: [`plugin::${pluginId}.cache.purge`] },
        },
      ],
    },
  },
];

export default purgeRoutes;
