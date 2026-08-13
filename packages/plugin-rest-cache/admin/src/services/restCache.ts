import { useCallback, useEffect, useState } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';

import { pluginId } from '../pluginId';
import type {
  CacheSummary,
  ProviderResponse,
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

interface QueryResult<T> {
  data?: T;
  error?: unknown;
  isLoading: boolean;
  refetch: () => void;
}

const useEndpoint = <T,>(key: string): QueryResult<T> => {
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
    if (entry.data !== undefined || entry.error !== undefined || entry.promise) {
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
  }, [entry, get, key, entry.version]);

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
