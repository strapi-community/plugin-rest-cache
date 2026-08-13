import {
  RedisCacheProvider,
  type RedisCacheProviderOptions,
  type RedisClient,
} from './RedisCacheProvider';

/**
 * The Strapi global.
 *
 * `strapi.redis` is installed by `@strapi-community/plugin-redis`, which ships
 * no type declarations, so the registry is described here rather than imported.
 */
declare const strapi: {
  log: { info(message: string): void };
};

/** Strapi as this provider needs to see it: whatever the redis plugin added. */
interface StrapiWithRedis {
  redis?: {
    connections: Record<string, { client?: RedisClient } | undefined>;
  };
}

function waitForRedis(client: RedisClient): Promise<void> {
  return new Promise((resolve, reject) => {
    const onReady = () => {
      strapi.log.info('REST Cache provider "redis": connection established');

      // eslint-disable-next-line no-use-before-define
      client.off('error', onError);
      resolve();
    };
    const onError = (error: { message?: string }) => {
      client.off('ready', onReady);
      reject(new Error(`Could not initialize REST Cache provider "redis": ${error?.message}`));
    };

    if (client.status === 'ready') {
      return onReady();
    }

    client.once('ready', onReady);
    client.once('error', onError);
  });
}

// `export =` rather than named exports: the plugin loads this entry through
// `createRequire(...)(modulePath)` and reads `provider`, `name` and `init` off
// the result, so module.exports has to stay a plain object with exactly those
// keys - no `__esModule` marker and no interop wrapper in between.
export = {
  provider: 'redis',
  name: 'Redis',

  async init(options: RedisCacheProviderOptions, { strapi }: { strapi: StrapiWithRedis }) {
    if (!strapi.redis) {
      throw new Error(
        `Could not initialize REST Cache provider "redis". The package "@strapi-community/plugin-redis" is required.`
      );
    }

    const connectionName = options.connection || 'default';
    const { client } = strapi.redis.connections[connectionName] ?? {};

    if (!client) {
      throw new Error(
        `Could not initialize REST Cache provider "redis". No connection found with name "${connectionName}".`
      );
    }

    return waitForRedis(client).then(() => new RedisCacheProvider(client, options));
  },
};
