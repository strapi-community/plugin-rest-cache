import type { CachePluginStrategy } from './CachePluginStrategy';

/**
 * The provider as it is written in config/plugins - a selection plus its
 * options, not the instantiated CacheProvider the store runs on.
 *
 * `options` is where connection details live for non-memory providers, which is
 * why the stats service exposes only `name` from it.
 */
export interface CacheProviderConfig {
  name: string;
  getTimeout?: number;
  options?: Record<string, unknown>;
}

/**
 * The shape of `strapi.config.get('plugin::rest-cache')` once the plugin has
 * registered - that is, after resolveUserStrategy has replaced the user's
 * partial input with a resolved CachePluginStrategy.
 */
export interface RestCachePluginConfig {
  strategy: CachePluginStrategy;
  provider: CacheProviderConfig;
}
