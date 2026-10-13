import { EventEmitter } from 'events';

/** A queued MULTI, as node-redis returns it from `multi()`. */
export interface NodeRedisMulti {
  set(key: string, value: string, options?: NodeRedisSetOptions): NodeRedisMulti;
  sAdd(key: string, members: string | string[]): NodeRedisMulti;
  sRem(key: string, members: string | string[]): NodeRedisMulti;
  unlink(keys: string | string[]): NodeRedisMulti;
  exec(): Promise<unknown[]>;
}

interface NodeRedisSetOptions {
  expiration?: { type: 'PX'; value: number };
}

/**
 * The node-redis client, as `@strapi-community/plugin-redis` v3 hands it over
 * on `connections[name].native` - a standalone client or a cluster.
 *
 * Described structurally for the same reason RedisClient is: the connection,
 * and therefore the @redis/client version, belongs to the redis plugin.
 *
 * Only the members this store touches are listed.
 */
export interface NodeRedisClient {
  isReady: boolean;
  get(key: string): Promise<string | null>;
  mGet(keys: string[]): Promise<Array<string | null>>;
  set(key: string, value: string, options?: NodeRedisSetOptions): Promise<unknown>;
  exists(keys: string | string[]): Promise<number>;
  sAdd(key: string, members: string | string[]): Promise<number>;
  sRem(key: string, members: string | string[]): Promise<number>;
  sMembers(key: string): Promise<string[]>;
  unlink(keys: string | string[]): Promise<number>;
  scan(
    cursor: string,
    options?: { MATCH?: string; COUNT?: number }
  ): Promise<{ cursor: string; keys: string[] }>;
  sScan(
    key: string,
    cursor: string,
    options?: { MATCH?: string; COUNT?: number }
  ): Promise<{ cursor: string; members: string[] }>;
  multi(): NodeRedisMulti;
  /** On a cluster (@redis/client 5+): one entry per master, for nodeClient(). */
  readonly masters?: unknown[];
  /** On a cluster: the client connected to one node of `masters`. */
  nodeClient?(node: unknown): Promise<Pick<NodeRedisClient, 'scan'>>;
}

/**
 * The tracking set, as the provider's background prune sees it.
 *
 * The prune's logic - SSCAN a batch, check which members still exist, SREM the
 * dead, re-check and re-add - lives once, in RedisCacheProvider, and runs on
 * plugin-redis v2's ioredis client and v3's node-redis client alike through
 * this. See https://github.com/strapi-community/plugin-rest-cache/issues/131
 */
export interface TrackingSet {
  /** One SSCAN step: the next cursor ('0' when done) and a batch of members. */
  sscan(cursor: string, count: number): Promise<[string, string[]]>;
  /**
   * Whether each key exists. Never rejects: a key that could not be checked is
   * reported as existing, because untracking a live entry hides it from every
   * purge while keeping a dead one only costs a wasted UNLINK later.
   */
  existing(keys: string[]): Promise<boolean[]>;
  srem(members: string[]): Promise<unknown>;
  sadd(members: string[]): Promise<unknown>;
}

export interface NodeRedisStoreOptions {
  /** Whether `client` is a cluster. Decides which commands are slot-safe. */
  isCluster: boolean;
  /** As @keyv/redis' option of the same name. Defaults to true. */
  useRedisSets?: boolean;
}

const UNLINK_CONCURRENCY = 16;
const CHUNK = 1000;

/**
 * A keyv storage adapter over node-redis that stores exactly what @keyv/redis 3
 * stores.
 *
 * On plugin-redis v2 the provider runs on @keyv/redis 3 and the plugin's
 * ioredis client. Entries written that way outlive an upgrade to plugin-redis
 * v3, so this store has to find, read and purge them - and @keyv/redis 3 has to
 * do the same with this store's entries after a rollback. Every key name, the
 * `namespace:<ns>` tracking set, and the PX expiry below mirror
 * @keyv/redis@3.0.1, including its `useRedisSets: false` key naming.
 *
 * @keyv/redis 5 also runs on node-redis but is not usable here: it keeps no
 * tracking set, separates keys with "::", and destroys the client it was given
 * when a connection fails - which, with a shared plugin connection, would take
 * it away from every other consumer.
 *
 * The client belongs to the redis plugin. Nothing here ever closes it.
 *
 * @see https://github.com/strapi-community/plugin-rest-cache/pull/239
 */
export class NodeRedisStore extends EventEmitter {
  readonly ttlSupport = true;

  /** Set by Keyv. Keyv also prefixes every key with it before calling us. */
  namespace?: string;

  readonly opts: { dialect: 'redis'; url: string; useRedisSets: boolean };

  /**
   * The client to use right now.
   *
   * plugin-redis v3 replaces the node-redis client of a cluster or sentinel
   * connection when it has to reconnect from scratch, destroying the old one;
   * `connection.native` is a getter for whichever is current. So the client is
   * resolved on every use rather than kept: a reference taken at bootstrap
   * would go on pointing at a destroyed client.
   */
  get client(): NodeRedisClient {
    return this.resolveClient();
  }

  private readonly resolveClient: () => NodeRedisClient;

  readonly isCluster: boolean;

  /**
   * @param client the client, or a function returning the current one - pass
   *   `() => connection.native` for a plugin-redis v3 connection.
   */
  constructor(
    client: NodeRedisClient | (() => NodeRedisClient),
    options: NodeRedisStoreOptions
  ) {
    super();
    this.resolveClient = typeof client === 'function' ? client : () => client;
    this.isCluster = options.isCluster;
    // `dialect` is what makes Keyv treat this store as iterable.
    this.opts = {
      dialect: 'redis',
      url: 'redis://',
      useRedisSets: options.useRedisSets !== false,
    };
  }

  /** The tracking set's key, as @keyv/redis names it. */
  _getNamespace(): string {
    return `namespace:${this.namespace}`;
  }

  private keyName(key: string): string {
    return this.opts.useRedisSets ? key : `sets:${this._getNamespace()}:${key}`;
  }

  private static setOptions(ttl?: number): NodeRedisSetOptions | undefined {
    // A ttl in milliseconds, written as PX. Never converted.
    return typeof ttl === 'number' ? { expiration: { type: 'PX', value: ttl } } : undefined;
  }

  async get(key: string): Promise<string | undefined> {
    const value = await this.client.get(this.keyName(key));
    return value === null ? undefined : value;
  }

  async getMany(keys: string[]): Promise<Array<string | null>> {
    const names = keys.map((key) => this.keyName(key));
    // MGET across hash slots is a CROSSSLOT error on a cluster.
    if (this.isCluster) {
      return Promise.all(names.map((name) => this.client.get(name)));
    }
    return this.client.mGet(names);
  }

  async set(key: string, value: string | undefined, ttl?: number): Promise<void> {
    if (value === undefined) {
      return;
    }
    const name = this.keyName(key);
    const options = NodeRedisStore.setOptions(ttl);

    if (!this.opts.useRedisSets) {
      await this.client.set(name, value, options);
      return;
    }

    // The entry and the tracking set are two keys in different hash slots, so
    // on a cluster they cannot share a MULTI. Write the entry first: a crash in
    // between leaves an untracked entry that expires, never a tracked key with
    // nothing behind it.
    if (this.isCluster) {
      await this.client.set(name, value, options);
      await this.client.sAdd(this._getNamespace(), name);
      return;
    }

    await this.client.multi().set(name, value, options).sAdd(this._getNamespace(), name).exec();
  }

  async delete(key: string): Promise<boolean> {
    const name = this.keyName(key);

    if (!this.opts.useRedisSets) {
      return (await this.client.unlink(name)) > 0;
    }

    // Untrack first, then unlink, as the plugin-redis v2 path does on a
    // cluster (#244). Without a MULTI a delete interleaves with a write of the
    // same key, and unlinking first could run UNLINK (delete) -> SET, SADD
    // (write) -> SREM (delete): a live entry missing from the tracking set,
    // which keys() cannot list and so no purge can ever find. In this order the
    // race leaves at worst a tracked key with nothing behind it, which the
    // prune removes. An error between the two now leaves an untracked entry
    // until its maxAge instead; makeClusterSafe in RedisCacheProvider has the
    // trade-off. See https://github.com/strapi-community/plugin-rest-cache/issues/100
    if (this.isCluster) {
      await this.client.sRem(this._getNamespace(), name);
      return (await this.client.unlink(name)) > 0;
    }

    const [removed] = await this.client
      .multi()
      .unlink(name)
      .sRem(this._getNamespace(), name)
      .exec();
    return Number(removed) > 0;
  }

  async deleteMany(keys: string[]): Promise<boolean> {
    const results = await Promise.all(keys.map((key) => this.delete(key)));
    return results.every(Boolean);
  }

  async has(key: string): Promise<boolean> {
    return (await this.client.exists(this.keyName(key))) !== 0;
  }

  async clear(): Promise<void> {
    if (this.opts.useRedisSets) {
      await this.unlinkTracked(await this.client.sMembers(this._getNamespace()));
      return;
    }

    // Every key is named under the namespace, as @keyv/redis 3 names it, so
    // one pattern finds them all - on every master of a cluster.
    const keys = await this.namedKeys();
    if (this.isCluster) {
      // A multi-key UNLINK spanning hash slots is CROSSSLOT on a cluster.
      for (const batch of chunks(keys, UNLINK_CONCURRENCY)) {
        await Promise.all(batch.map((key) => this.client.unlink(key)));
      }
      return;
    }
    for (const batch of chunks(keys, CHUNK)) {
      await this.client.unlink(batch);
    }
  }

  /**
   * Every entry's raw key when redis sets are off: `sets:namespace:<ns>:<key>`.
   *
   * There is no tracking set to read then, so the keys are found by that name.
   * SCAN only sees the node it is sent to, so on a cluster each master is
   * scanned through its own client; scanning one node made pattern purges miss
   * every entry held elsewhere (#245, as on the plugin-redis v2 path).
   */
  async namedKeys(): Promise<string[]> {
    const MATCH = `sets:${this._getNamespace()}:*`;
    const scanAll = async (node: Pick<NodeRedisClient, 'scan'>, found: string[]) => {
      let cursor = '0';
      do {
        const reply = await node.scan(cursor, { MATCH, COUNT: CHUNK });
        cursor = String(reply.cursor);
        found.push(...reply.keys);
      } while (cursor !== '0');
    };

    const found: string[] = [];
    if (!this.isCluster) {
      await scanAll(this.client, found);
      return found;
    }

    const { masters } = this.client;
    if (!masters || typeof this.client.nodeClient !== 'function') {
      // Better a failed purge than one that reports success having looked at
      // a single node.
      throw new Error(
        'REST Cache provider "redis": this node-redis cluster client cannot list its masters'
      );
    }
    for (const master of masters) {
      await scanAll(await this.client.nodeClient(master), found);
    }
    return found;
  }

  /**
   * Yields [key, value] for keys under `namespace`, as @keyv/redis 3 does.
   *
   * Kept for Keyv's own iterator(). The provider never calls it: it reads the
   * tracking set, or namedKeys() when redis sets are off. SCAN addresses a
   * single node, so on a cluster this would silently return part of the
   * keyspace - refuse rather than mislead.
   */
  async *iterator(namespace?: string): AsyncGenerator<[string, string | null]> {
    if (this.isCluster) {
      throw new Error(
        'REST Cache provider "redis": enumerating keys on a cluster needs useRedisSets enabled'
      );
    }

    let cursor = '0';
    do {
      const reply = await this.client.scan(cursor, { MATCH: `${namespace}:*` });
      cursor = String(reply.cursor);
      if (reply.keys.length > 0) {
        const values = await this.client.mGet(reply.keys);
        for (let i = 0; i < reply.keys.length; i += 1) {
          yield [reply.keys[i], values[i]];
        }
      }
    } while (cursor !== '0');
  }

  /**
   * Remove fully qualified keys and their tracking-set members.
   *
   * One MULTI per chunk on a standalone server. A cluster rejects a multi-key
   * UNLINK or a MULTI spanning hash slots, so there each key is unlinked on its
   * own; the tracking set is a single key, so SREM against it stays batched.
   * See https://github.com/strapi-community/plugin-rest-cache/issues/100
   */
  async unlinkTracked(qualified: string[]): Promise<void> {
    if (!qualified.length) return;
    const set = this._getNamespace();

    // Untracked before anything is unlinked, for the reason given in
    // delete(): unlinking first loses entries to a racing write (#244).
    if (this.isCluster) {
      for (const batch of chunks(qualified, CHUNK)) {
        await this.client.sRem(set, batch);
      }
      for (const batch of chunks(qualified, UNLINK_CONCURRENCY)) {
        await Promise.all(batch.map((key) => this.client.unlink(key)));
      }
      return;
    }

    for (const batch of chunks(qualified, CHUNK)) {
      await this.client.multi().unlink(batch).sRem(set, batch).exec();
    }
  }

  /** Every tracked key, fully qualified. */
  async trackedKeys(): Promise<string[]> {
    return this.client.sMembers(this._getNamespace());
  }

  /**
   * The tracking set, for the provider's prune; undefined when there is none.
   *
   * Every command resolves `this.client` as it is sent, never once per pass:
   * a pass takes seconds on a large set, and plugin-redis v3 may replace the
   * client in the middle of one.
   */
  trackingSet(): TrackingSet | undefined {
    if (!this.opts.useRedisSets || !this.namespace) return undefined;
    const set = this._getNamespace();

    return {
      sscan: async (cursor, count) => {
        const reply = await this.client.sScan(set, cursor, { COUNT: count });
        return [String(reply.cursor), reply.members];
      },
      // One EXISTS per key: a variadic EXISTS only returns a count, and on a
      // cluster it would span hash slots. Issued together, so node-redis sends
      // them as one pipeline on a standalone server (it batches every command
      // made in the same tick) and routes each to its node on a cluster.
      existing: async (keys) => {
        try {
          return await Promise.all(
            keys.map((key) =>
              this.client.exists(key).then(
                (count) => Number(count) > 0,
                () => true
              )
            )
          );
        } catch {
          return keys.map(() => true);
        }
      },
      // One key, the set, so a batched SREM or SADD is slot-safe on a cluster.
      srem: (members) => this.client.sRem(set, members),
      sadd: (members) => this.client.sAdd(set, members),
    };
  }

  get ready(): boolean {
    return this.client.isReady === true;
  }

  /** The client is the redis plugin's, shared with every other consumer. */
  async disconnect(): Promise<void> {}
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
