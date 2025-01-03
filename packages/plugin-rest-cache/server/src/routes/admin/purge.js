'use strict';

//TODO: Fix this broken require with rollup
//const pluginId = require('../../pluginId');
const pluginId = 'rest-cache';

module.exports = [
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
