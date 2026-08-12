'use strict';

/**
 * @typedef {import('@strapi/strapi').Strapi} Strapi
 */

const { MemoryCacheProvider } = require('./MemoryCacheProvider');

module.exports = {
  provider: 'memory',
  name: 'Memory',

  async init(options /* , { strapi } */) {
    return MemoryCacheProvider.create(options);
  },
};
