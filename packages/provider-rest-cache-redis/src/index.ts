import {
  RedisCacheProvider,
  type RedisCacheProviderOptions,
  type RedisClient,
} from './RedisCacheProvider';
import type { NodeRedisClient } from './NodeRedisStore';

/**
 * The Strapi global.
 *
 * `strapi.redis` is installed by `@strapi-community/plugin-redis`, which ships
 * no type declarations, so the registry is described here rather than imported.
 */
declare const strapi: {
  log: { info(message: string): void };
};

/** plugin-redis v3's connection service - the part this provider uses. */
interface RedisConnectionService {
  whenReady(
    name: string
  ): Promise<{ client: RedisClient; native: NodeRedisClient; type?: string }>;
}

/** Strapi as this provider needs to see it: whatever the redis plugin added. */
interface StrapiWithRedis {
  log: { info(message: string): void };
  redis?: {
    connections: Record<string, { client?: RedisClient } | undefined>;
  };
  plugin?(name: string): { service?(name: string): unknown } | undefined;
}

/**
 * plugin-redis v3's connection service, or undefined on v2.
 *
 * Detected by capability, not by version: v3 registers a `connection` service
 * with `whenReady`, v2 registers none. The provider initialises in bootstrap,
 * after every plugin's register, so the service exists by then if it ever will.
 * See https://github.com/strapi-community/plugin-rest-cache/pull/239
 */
function v3ConnectionService(strapi: StrapiWithRedis): RedisConnectionService | undefined {
  try {
    const service = strapi.plugin?.('redis')?.service?.('connection') as
      | Partial<RedisConnectionService>
      | undefined;
    return typeof service?.whenReady === 'function'
      ? (service as RedisConnectionService)
      : undefined;
  } catch {
    return undefined;
  }
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

    // plugin-redis v3: wait through its own service, which rejects rather than
    // hanging, and run on the node-redis client. Its ioredis shim is kept as
    // `provider.client` only, for anyone typed against it.
    const connections = v3ConnectionService(strapi);
    if (connections) {
      let connection: Awaited<ReturnType<RedisConnectionService['whenReady']>>;
      try {
        connection = await connections.whenReady(connectionName);
      } catch (error) {
        throw new Error(
          `Could not initialize REST Cache provider "redis": ${(error as Error)?.message}`
        );
      }

      strapi.log.info('REST Cache provider "redis": connection established');
      return new RedisCacheProvider(connection.client, options, {
        client: connection.native,
        isCluster: connection.type === 'cluster',
      });
    }

    const { client } = strapi.redis.connections[connectionName] ?? {};

    if (!client) {
      throw new Error(
        `Could not initialize REST Cache provider "redis". No connection found with name "${connectionName}".`
      );
    }

    return waitForRedis(client).then(() => new RedisCacheProvider(client, options));
  },
};
