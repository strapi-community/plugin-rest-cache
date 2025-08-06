'use strict';

import bootstrap from './bootstrap';
import services from './services';
import config from './config';
import controllers from './controllers';
import middlewares from './middlewares';
import routes from './routes';
import register from './register';

export default {
  bootstrap,
  register,
  config,
  controllers,
  routes,
  services,
  middlewares,
};
