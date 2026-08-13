'use strict';

import admin from './admin';
import contentApi from './content-api';

export default {
  admin,
  // Mounted at /api/rest-cache/*, and only registered when
  // strategy.enableContentApiPurge is enabled - see server/src/register.js.
  'content-api': contentApi,
};
