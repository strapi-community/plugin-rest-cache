import { useCallback, useEffect, useState } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';

import { pluginId } from '../pluginId';
import type {
  CacheSummary,
  ProviderResponse,
  PurgeableContentTypesResponse,
  PurgeRequest,
  StrategyResponse,
} from '../../../server/src/types/api';

/**
 * Data access for the plugin's admin API.
 *
 * Built on `useFetchClient` rather than the admin panel's RTK Query instance,
 * which looks like the more idiomatic choice and is not.
 *
 * A plugin ships as a prebuilt ES module that imports `@strapi/strapi/admin`
 * as an external. Under `strapi develop` Vite dedupes that to the host's copy,
 * so everything shared through it - the redux store, the RTK `adminApi`, the
 * Auth context - is the same instance the panel uses. Under `strapi build` it
 * does not: the plugin chunk gets its own copy of that module graph. Endpoints
 * injected into "our" adminApi are then absent from the store's reducer, and
 * the moment a response lands RTK dies with
 *
 *   TypeError: Cannot read properties of undefined (reading 'merge')
 *
 * leaving the page on its loading state forever. The same split makes the Auth
 * context unreachable, which is why nothing here uses `useRBAC` either.
 *
 * `useFetchClient` is safe because it shares nothing but a function: it reads
 * the token and returns an axios-like client, with no cross-module state.
 *
 * The deduplication and invalidation RTK gave us are kept, deliberately small,
 * in the module-level cache below.
 */

type Listener = () => void;

interface Entry<T> {
  data?: T;
  error?: unknown;
  promise?: Promise<void>;
  /**
   * Bumped on every invalidation.
   *
   * Subscribers depend on it, so clearing an entry re-runs their fetch effect.
   * Without it, invalidating leaves `data` undefined and nothing ever asks for
   * it again - the page sits on its loading state for good.
   */
  version: number;
  listeners: Set<Listener>;
}

/**
 * One entry per endpoint.
 *
 * The strategy is read by the purge button, the document action, the list-view
 * injection and the edit-view panel. Without this, opening a content-manager
 * view issues the same request four times - which is exactly what the previous
 * per-component `useReducer` + fetch did.
 */
const cache = new Map<string, Entry<unknown>>();

const entryFor = <T,>(key: string): Entry<T> => {
  let entry = cache.get(key) as Entry<T> | undefined;

  if (!entry) {
    entry = { version: 0, listeners: new Set() };
    cache.set(key, entry as Entry<unknown>);
  }

  return entry;
};

const notify = (entry: Entry<unknown>) => {
  entry.listeners.forEach((listener) => listener());
};

/** Drop cached responses so the next subscriber refetches. */
export const invalidateCache = (keys: string[] = [...cache.keys()]) => {
  for (const key of keys) {
    const entry = cache.get(key);

    if (entry) {
      entry.data = undefined;
      entry.error = undefined;
      entry.promise = undefined;
      entry.version += 1;
      notify(entry);
    }
  }
};

export const STRATEGY_KEY = 'config/strategy';
export const PROVIDER_KEY = 'config/provider';
export const STATS_KEY = 'stats';
export const PURGEABLE_KEY = 'purge/content-types';

interface QueryResult<T> {
  data?: T;
  error?: unknown;
  isLoading: boolean;
  refetch: () => void;
}

/**
 * `enabled: false` subscribes without fetching. Hooks cannot be called
 * conditionally, so this is how a fallback request is held back until the
 * response it falls back from says it is needed.
 */
const useEndpoint = <T,>(key: string, enabled = true): QueryResult<T> => {
  const { get } = useFetchClient();
  const entry = entryFor<T>(key);
  // Re-render on any change to the entry - a fetch completing as well as an
  // invalidation. A counter derived from entry.version would not do: after a
  // fetch resolves the version is unchanged, so setting it would be a no-op
  // and the arriving data would never be painted.
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender((n) => n + 1);
    entry.listeners.add(listener);

    return () => {
      entry.listeners.delete(listener);
    };
  }, [entry]);

  useEffect(() => {
    if (
      !enabled ||
      entry.data !== undefined ||
      entry.error !== undefined ||
      entry.promise
    ) {
      return;
    }

    // Concurrent subscribers await the same promise rather than each issuing
    // their own request.
    entry.promise = get(`/${pluginId}/${key}`)
      .then((response) => {
        entry.data = response.data as T;
        entry.error = undefined;
      })
      .catch((error: unknown) => {
        entry.error = error;
      })
      .finally(() => {
        entry.promise = undefined;
        notify(entry as Entry<unknown>);
      });
    // entry.version is read during render, so an invalidation - which bumps it
    // and notifies - re-runs this effect and refetches.
  }, [entry, get, key, entry.version, enabled]);

  const refetch = useCallback(() => invalidateCache([key]), [key]);

  return {
    data: entry.data,
    error: entry.error,
    isLoading: entry.data === undefined && entry.error === undefined,
    refetch,
  };
};

export const useCacheStrategy = () => useEndpoint<StrategyResponse>(STRATEGY_KEY);
export const useCacheProvider = () => useEndpoint<ProviderResponse>(PROVIDER_KEY);
export const useCacheStats = () => useEndpoint<CacheSummary>(STATS_KEY);

/**
 * Whether a request was refused for lack of permission.
 *
 * Checks both places the status can be: useFetchClient's FetchError carries
 * it on `status`, an axios-shaped error on `response.status`. Structural
 * rather than `instanceof`, because the FetchError class this chunk would
 * import is not the one the host's fetch client throws in a production build.
 */
export const isForbidden = (error: unknown): boolean => {
  const { status, response } = (error ?? {}) as {
    status?: number;
    response?: { status?: number };
  };

  return status === 403 || response?.status === 403;
};

/**
 * The uids of the cached content types, for deciding whether to offer a purge
 * control.
 *
 * Read from the strategy when this admin may read it - every component on
 * the page shares that request anyway. An admin holding cache.purge without
 * cache.read-strategy gets a 403 there, and would otherwise never see the
 * control their permission is for; for them, and only after that 403, this
 * asks the endpoint that is gated by cache.purge itself. An admin with
 * neither gets a 403 from both, and sees no control, as before.
 */
export const usePurgeableContentTypes = (): string[] | undefined => {
  const strategy = useCacheStrategy();
  const fallback = useEndpoint<PurgeableContentTypesResponse>(
    PURGEABLE_KEY,
    isForbidden(strategy.error)
  );

  if (strategy.data) {
    return strategy.data.strategy?.contentTypes?.map((config) => config.contentType);
  }

  return fallback.data?.contentTypes;
};

export const usePurgeCache = () => {
  const { post } = useFetchClient();

  return useCallback(
    async (body: PurgeRequest) => {
      await post(`/${pluginId}/purge`, body);

      // Counts change, configuration does not.
      invalidateCache([STATS_KEY]);
    },
    [post]
  );
};
