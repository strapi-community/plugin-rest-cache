'use strict';

const looksLikeInstanceof = (value, target) => {
  let current = value?.constructor;
  do {
    if (current?.name === target.name) return true;
    current = Object.getPrototypeOf(current);
  } while (current?.name);
  return false;
};

import chalk from 'chalk';
import { createRequire } from 'module';
import permissionsActions from './permissions-actions';
import { CacheProvider } from './types';
const createProvider = async (providerConfig, { strapi }) => {
  const providerName = providerConfig.name.toLowerCase();
  let provider;

  const packageName = `@strapi-community/provider-rest-cache-${providerName}`;
  let modulePath;
  let resolved = false;
  try {
    /**
     * @todo Allow custom providers installed from npm.
     * Right now it will only load providers from the `@strapi-community` namespace.
     */
    modulePath = require.resolve(packageName);
    resolved = true;
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      modulePath = providerName;
    } else {
      throw error;
    }
  }
  try {
    // eslint-disable-next-line
    const requireProvider = createRequire(import.meta.url);
    provider = requireProvider(modulePath);
  } catch (err) {
    // Never collapse the underlying failure into "you should install it". The
    // provider is a dependency of this plugin, so it is almost always present,
    // and the real cause is usually an unsupported Node version or a module
    // interop problem. Reporting "not installed" sends people off reinstalling
    // a package they already have.
    // See https://github.com/strapi-community/plugin-rest-cache/issues/128
    const hint = resolved
      ? `The package "${packageName}" was found at "${modulePath}" but could not be loaded.`
      : `The package "${packageName}" could not be resolved. You may need to install it: "yarn add ${packageName}".`;

    throw new Error(
      `Could not load REST Cache provider "${providerName}". ${hint}\n` +
        `  Cause: ${err.code ? `[${err.code}] ` : ''}${err.message}\n` +
        `  Running Node ${process.version}. This plugin requires Node >=20.0.0.`,
      { cause: err }
    );
  }

  const providerInstance = await provider.init(providerConfig.options, {
    strapi,
  });

  if (!looksLikeInstanceof(providerInstance, CacheProvider)) {
    throw new Error(
      `Could not load REST Cache provider "${providerName}". The package "@strapi-community/provider-rest-cache-${providerName}" does not export a CacheProvider instance.`
    );
  }

  return Object.freeze(providerInstance);
};

/**
 * @param {{ strapi: Strapi }} strapi
 */
export default async function bootstrap({ strapi }) {
  // resolve user configuration, check for missing or invalid optinos
  const pluginOption = strapi.config.get('plugin::rest-cache');
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
  await strapi.admin.services.permission.actionProvider.registerMany(permissionsActions.actions);

  // register cache provider
  const provider = await createProvider(pluginOption.provider, { strapi });
  await cacheStore.init(provider);

  strapi.log.info(
    `Using REST Cache plugin with provider "${chalk.cyan(pluginOption.provider.name)}"`
  );
}
