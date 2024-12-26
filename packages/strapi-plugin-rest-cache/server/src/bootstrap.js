'use strict';


 const looksLikeInstanceof =(value, target) => {
  let current = value?.constructor
  do {
    if (current?.name === target.name) return true
    current = Object.getPrototypeOf(current)
  } while (current?.name)
  return false
}

const chalk = require('chalk');
const { createRequire } = require("module");
const permissionsActions = require('./permissions-actions');
const { CacheProvider } = require('./types');
const  createProvider = async (providerConfig, { strapi }) => {
  const providerName = providerConfig.name.toLowerCase();
  let provider;

  let modulePath;
  try {
    modulePath = require.resolve(`strapi-provider-rest-cache-${providerName}`);
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      modulePath = providerName;
    } else {
      throw error;
    }
  }
  console.log(modulePath)
  try {
    // eslint-disable-next-line
    const requireProvider = createRequire(import.meta.url);
    provider = requireProvider(modulePath)
  } catch (err) {
    console.log(err)
    throw new Error(
      `Could not load REST Cache provider "${providerName}". You may need to install a provider plugin "yarn add strapi-provider-rest-cache-${providerName}".`
    );
  }

  const providerInstance = await provider.init(providerConfig.options, {
    strapi,
  });
  
  if (!looksLikeInstanceof(providerInstance,CacheProvider)) {
    throw new Error(
      `Could not load REST Cache provider "${providerName}". The package "strapi-provider-rest-cache-${providerName}" does not export a CacheProvider instance.`
    );
  }

  return Object.freeze(providerInstance);
};

/**
 * @param {{ strapi: Strapi }} strapi
 */
async function bootstrap({ strapi }) {
  // resolve user configuration, check for missing or invalid optinos
  const pluginOption = strapi.config.get("plugin::rest-cache");
  const cacheStore = strapi.plugin('rest-cache').service('cacheStore');
  // watch for changes in any roles -> clear all cache
  // need to be done before lifecycles are registered
  if (strapi.plugin('users-permissions')) {
    strapi.db.lifecycles.subscribe({
      models: ['plugin::users-permissions.role'],
      async beforeDelete() {
        await cacheStore.reset();
      },
    });
  }
  // boostrap plugin permissions
  await strapi.admin.services.permission.actionProvider.registerMany(
    permissionsActions.actions
  );

  // register cache provider
  const provider = await createProvider(pluginOption.provider, { strapi });
  cacheStore.init(provider);

  strapi.log.info(
    `Using REST Cache plugin with provider "${chalk.cyan(
      pluginOption.provider.name
    )}"`
  );
}

module.exports = {
  bootstrap,
};
