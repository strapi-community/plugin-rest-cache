import { createCache, type Cache } from 'cache-manager';
import { CacheProvider } from '@strapi-community/plugin-rest-cache/types';
import type { CacheKey, Milliseconds } from '@strapi-community/plugin-rest-cache/types';

// keyv 4 exports the constructor directly, keyv 5 exports it as `.default`.
// Accept both: which one we get depends on what else in the host application's
// dependency tree won the hoist.
//
// Loaded through `require` and typed `any` on purpose. The whole reason the
// fallback exists is that the runtime shape is not knowable from the type
// declarations of whichever copy happens to be installed, so pinning it to one
// of the two shapes here would just move the problem into the compiler.
const keyvModule: any = require('keyv');
const Keyv = keyvModule.default ?? keyvModule;

/**
 * The quick-lru constructor, as it arrives from a dynamic import.
 *
 * Deliberately loose in its options: everything the user put under
 * `provider.options` is forwarded to quick-lru untouched, and quick-lru
 * validates it itself (it throws unless `maxSize` is a number greater than 0).
 */
type QuickLRUConstructor = new (options: Record<string, unknown>) => unknown;

/**
 * Everything accepted under `provider.options` in the plugin configuration.
 *
 * `ttl` is consumed here as cache-manager's store-level default lifetime; every
 * other key is handed to quick-lru as-is.
 */
export interface MemoryCacheProviderOptions {
  /** Store-level default lifetime, in milliseconds. */
  ttl?: Milliseconds | number;
  /** Maximum number of entries held before the least recently used are evicted. */
  maxSize?: number;
  /** Legacy alias for `maxSize`, renamed before the store is constructed. */
  max?: number;
  [option: string]: unknown;
}

export class MemoryCacheProvider extends CacheProvider {
  private readonly cache: Cache;

  /**
   * quick-lru v7 is ESM-only, so it cannot be require()d from CommonJS on Node
   * versions without require(esm) (added in 20.19). Loading it with a dynamic
   * import works on every supported Node version, which is why construction
   * goes through this factory rather than the constructor.
   *
   * Do not "simplify" this back to a top-level require - see
   * https://github.com/strapi-community/plugin-rest-cache/issues/128
   *
   * The tsconfig compiles to `module: Node16` for the same reason: under plain
   * `module: CommonJS` TypeScript rewrites this `import()` into a `require()`
   * and reintroduces the bug at build time.
   */
  static async create(options: MemoryCacheProviderOptions): Promise<MemoryCacheProvider> {
    const quickLruModule: any = await import('quick-lru');
    const QuickLRU: QuickLRUConstructor = quickLruModule.default ?? quickLruModule;

    return new MemoryCacheProvider(options, QuickLRU);
  }

  /**
   * Prefer MemoryCacheProvider.create(), which resolves QuickLRU for you.
   *
   * @param options
   * @param QuickLRU the quick-lru constructor
   */
  constructor(options: MemoryCacheProviderOptions, QuickLRU: QuickLRUConstructor) {
    super();

    if (typeof QuickLRU !== 'function') {
      throw new Error(
        'MemoryCacheProvider requires the QuickLRU constructor. Use MemoryCacheProvider.create(options) instead of calling the constructor directly.'
      );
    }

    const { ttl, ...adapterOptions } = options;

    if (adapterOptions.max) {
      adapterOptions.maxSize = adapterOptions.max;
      delete adapterOptions.max;
    }

    this.cache = createCache({
      ttl,
      stores: [
        new Keyv({
          store: new QuickLRU(adapterOptions),
        }),
      ],
    });
  }

  async get(key: CacheKey | string): Promise<unknown> {
    return this.cache.get(key);
  }

  /**
   * @param maxAge in milliseconds
   */
  async set(
    key: CacheKey | string,
    val: unknown,
    maxAge: Milliseconds | number = 3600000
  ): Promise<unknown> {
    // cache-manager's set() takes a ttl in milliseconds and maxAge is already
    // in milliseconds - do not convert.
    return this.cache.set(key, val, maxAge);
  }

  async del(key: CacheKey | string | string[]): Promise<unknown> {
    return this.cache.del(key as string);
  }

  async delMany(keys: Array<CacheKey | string>): Promise<void> {
    if (!keys.length) return;

    await this.cache.mdel(keys as string[]);
  }

  async keys(): Promise<string[]> {
    const keys: string[] = [];
    for await (const [key] of this.cache.stores[0].iterator({})) {
      keys.push(key);
    }
    return keys;
  }

  async clear(): Promise<void> {
    await this.cache.clear();
  }

  get ready(): boolean {
    return true;
  }
}
