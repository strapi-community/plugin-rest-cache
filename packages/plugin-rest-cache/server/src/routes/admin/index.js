'use strict';

import configRoutes from './config';
import purgeRoutes from './purge';

export default {
  type: 'admin',
  routes: [...configRoutes, ...purgeRoutes],
};
