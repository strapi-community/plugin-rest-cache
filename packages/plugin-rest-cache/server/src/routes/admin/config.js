'use strict';

import pluginId from '../../pluginId';

export default [
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
