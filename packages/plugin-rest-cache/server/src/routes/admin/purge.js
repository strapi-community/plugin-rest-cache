'use strict';

import pluginId from '../../pluginId';

export default [
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
