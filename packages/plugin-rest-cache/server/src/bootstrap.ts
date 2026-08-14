import type { Core } from '@strapi/strapi';
import { createRequire } from 'module';
import path from 'path';

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

  // Resolve from the Strapi application first, then from this plugin.
  //
  // The application is where a provider is actually installed - users run
  // `npm install @strapi-community/provider-rest-cache-redis` in their project,
  // not inside this package. Resolving only from here happens to work under
  // npm and yarn, whose flat node_modules hoists the provider somewhere a
  // walk up from this file finds it. Under pnpm's strict layout it does not,
  // and the plugin fails to boot with a MODULE_NOT_FOUND for a package that is
  // plainly installed.
  //
  // The e2e suite cannot catch that: it boots Strapi inside jest, whose
  // resolver is far more permissive than Node's. `scripts/boot-smoke.mjs`
  // boots a real child process for exactly this reason.
  //
  // Note both of these are `createRequire`, not a bare `require.resolve`. The
  // latter survives verbatim into the ESM half of this dual package, where
  // `require` does not exist, and the resulting ReferenceError carries no
  // `code`, so the handler below rethrew it - the plugin failed to boot for
  // anyone whose runtime took the `import` branch of the exports map.
  const requireFromPlugin = createRequire(import.meta.url);
  const requireFromApp = strapi.dirs?.app?.root
    ? createRequire(path.join(strapi.dirs.app.root, 'package.json'))
    : requireFromPlugin;

  let modulePath: string;
  let resolved = false;
  try {
    /**
     * @todo Allow custom providers installed from npm.
     * Right now it will only load providers from the `@strapi-community` namespace.
     */
    modulePath = requireFromApp.resolve(packageName);
    resolved = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error;

    try {
      // The memory provider is a dependency of this plugin rather than of the
      // application, so it resolves here and not above.
      modulePath = requireFromPlugin.resolve(packageName);
      resolved = true;
    } catch (fallbackError) {
      if ((fallbackError as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw fallbackError;
      modulePath = providerName;
    }
  }

  // Once resolved, modulePath is absolute and either require loads it. The bare
  // provider name only survives when nothing resolved, and that escape hatch
  // means a package the *application* installed.
  const requireProvider = requireFromApp;
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
