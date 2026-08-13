import type { Core } from '@strapi/strapi';
import { createRequire } from 'module';

import colors from './utils/colors';
import permissionsActions from './permissions-actions';
import { CacheProvider } from './types';
import type { CacheProviderConfig, RestCachePluginConfig } from './types/config';

/**
 * Structural instanceof.
 *
 * A provider package resolves its own copy of the types bundle, so its
 * CacheProvider is a different class object from ours and a real `instanceof`
 * is false even when the provider is entirely correct. Walking the constructor
 * chain by name accepts any provider that genuinely extends a CacheProvider,
 * whichever copy it extended.
 */
const looksLikeInstanceof = (value: unknown, target: { name: string }): boolean => {
  let current = (value as { constructor?: { name?: string } })?.constructor;
  do {
    if (current?.name === target.name) return true;
    current = Object.getPrototypeOf(current);
  } while (current?.name);
  return false;
};

/** What a provider package's entry point must expose. */
interface ProviderModule {
  init(
    options: Record<string, unknown> | undefined,
    context: { strapi: Core.Strapi }
  ): Promise<CacheProvider> | CacheProvider;
}

const createProvider = async (
  providerConfig: CacheProviderConfig,
  { strapi }: { strapi: Core.Strapi }
): Promise<CacheProvider> => {
  const providerName = providerConfig.name.toLowerCase();
  let provider: ProviderModule;

  const packageName = `@strapi-community/provider-rest-cache-${providerName}`;

  // Resolve and load through the same require.
  //
  // This used to call the bare `require.resolve`, which survives verbatim into
  // the ESM half of this dual package - and `require` does not exist in an ES
  // module. The resulting ReferenceError carries no `code`, so the handler
  // below rethrew it and the plugin failed to boot for anyone whose runtime
  // took the `import` branch of the exports map.
  const requireProvider = createRequire(import.meta.url);

  let modulePath: string;
  let resolved = false;
  try {
    /**
     * @todo Allow custom providers installed from npm.
     * Right now it will only load providers from the `@strapi-community` namespace.
     */
    modulePath = requireProvider.resolve(packageName);
    resolved = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
      modulePath = providerName;
    } else {
      throw error;
    }
  }
  try {
    provider = requireProvider(modulePath);
  } catch (err) {
    // Never collapse the underlying failure into "you should install it". The
    // provider is a dependency of this plugin, so it is almost always present,
    // and the real cause is usually an unsupported Node version or a module
    // interop problem. Reporting "not installed" sends people off reinstalling
    // a package they already have.
    // See https://github.com/strapi-community/plugin-rest-cache/issues/128
    const cause = err as NodeJS.ErrnoException;

    const hint = resolved
      ? `The package "${packageName}" was found at "${modulePath}" but could not be loaded.`
      : `The package "${packageName}" could not be resolved. You may need to install it with your package manager, e.g. "npm install ${packageName}".`;

    throw new Error(
      `Could not load REST Cache provider "${providerName}". ${hint}\n` +
        `  Cause: ${cause.code ? `[${cause.code}] ` : ''}${cause.message}\n` +
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

export default async function bootstrap({ strapi }: { strapi: Core.Strapi }) {
  // resolve user configuration, check for missing or invalid optinos
  const pluginOption = strapi.config.get<RestCachePluginConfig>('plugin::rest-cache');
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
  await cacheStore.init(provider);

  strapi.log.info(
    `Using REST Cache plugin with provider "${colors.cyan(pluginOption.provider.name)}"`
  );
}
