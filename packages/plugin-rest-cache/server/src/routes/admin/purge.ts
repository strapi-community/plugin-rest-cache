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
];

export default purgeRoutes;
