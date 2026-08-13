import { MemoryCacheProvider, type MemoryCacheProviderOptions } from './MemoryCacheProvider';

// `export =` rather than named exports: the plugin loads this entry through
// `createRequire(...)(modulePath)` and reads `provider`, `name` and `init` off
// the result, so module.exports has to stay a plain object with exactly those
// keys - no `__esModule` marker and no interop wrapper in between.
export = {
  provider: 'memory',
  name: 'Memory',

  async init(options: MemoryCacheProviderOptions /* , { strapi } */) {
    return MemoryCacheProvider.create(options);
  },
};
