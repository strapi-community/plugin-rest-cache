'use strict';

const { bootstrap } = require('./bootstrap');
const { services } = require('./services');
const { config } = require('./config');
const { controllers } = require('./controllers');
const { middlewares } = require('./middlewares');
const { routes } = require('./routes');
const { register } = require('./register')

module.exports = {
  bootstrap,
  register,
  config,
  controllers,
  routes,
  services,
  middlewares,
};
