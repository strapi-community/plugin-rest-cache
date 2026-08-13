import type { PluginRoute } from '../../types/routes';
import pluginId from '../../pluginId';

const configRoutes: PluginRoute[] = [
  {
    method: 'GET',
    path: '/config/strategy',
    handler: 'config.strategy',
    config: {
      policies: [
        'admin::isAuthenticatedAdmin',
        {
          name: 'plugin::content-manager.hasPermissions',
          config: { actions: [`plugin::${pluginId}.cache.read-strategy`] },
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/stats',
    handler: 'config.stats',
    config: {
      policies: [
        'admin::isAuthenticatedAdmin',
        {
          name: 'plugin::content-manager.hasPermissions',
          config: { actions: [`plugin::${pluginId}.cache.read-strategy`] },
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/config/provider',
    handler: 'config.provider',
    config: {
      policies: [
        'admin::isAuthenticatedAdmin',
        {
          name: 'plugin::content-manager.hasPermissions',
          config: { actions: [`plugin::${pluginId}.cache.read-provider`] },
        },
      ],
    },
  },
];

export default configRoutes;
