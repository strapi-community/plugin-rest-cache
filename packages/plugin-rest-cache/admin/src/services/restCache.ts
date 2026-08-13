// These two imports bind nothing on purpose, and must not be removed.
//
// The hooks below have types that RTK Query infers, and declaration emit has
// to write those types into a .d.ts. Under pnpm's isolated layout TypeScript
// resolves @reduxjs/toolkit through a symlink into .pnpm/, cannot name the
// package from there, and fails the build with TS2742. Referencing the package
// by name here gives it a name to use. @reduxjs/toolkit is a devDependency for
// the same reason: it is needed to compile, never imported at runtime - the
// admin panel supplies the store, and `adminApi` below comes from Strapi.
import type {} from '@reduxjs/toolkit';
import type {} from '@reduxjs/toolkit/query/react';
import { adminApi } from '@strapi/strapi/admin';

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
 * Built on the admin panel's own RTK Query instance rather than a bespoke
 * fetching layer, which buys three things the previous hook did not have:
 *
 * - **Deduplication.** The strategy is needed by the purge button, the
 *   document action, the list-view injection and the edit-view panel. Each
 *   previously ran its own `useReducer` + fetch on mount, so opening a
 *   content-manager view issued the same request four times. RTK Query
 *   collapses concurrent subscribers onto one in-flight request.
 * - **Invalidation.** A purge now invalidates the stats tag, so the dashboard
 *   re-reads counts by itself instead of showing figures that are wrong the
 *   moment the button is pressed.
 * - **Cancellation.** Unsubscribing aborts in flight, replacing the
 *   hand-rolled AbortController that each component constructed on every
 *   render (and therefore never actually aborted the request it belonged to).
 */
const api = adminApi
  .enhanceEndpoints({
    addTagTypes: ['RestCacheStrategy', 'RestCacheProvider', 'RestCacheStats'],
  })
  .injectEndpoints({
    endpoints: (builder) => ({
      getCacheStrategy: builder.query<StrategyResponse, void>({
        query: () => `/${pluginId}/config/strategy`,
        providesTags: ['RestCacheStrategy'],
      }),

      getCacheProvider: builder.query<ProviderResponse, void>({
        query: () => `/${pluginId}/config/provider`,
        providesTags: ['RestCacheProvider'],
      }),

      getCacheStats: builder.query<CacheSummary, void>({
        query: () => `/${pluginId}/stats`,
        providesTags: ['RestCacheStats'],
      }),

      purgeCache: builder.mutation<unknown, PurgeRequest>({
        query: (body) => ({
          url: `/${pluginId}/purge`,
          method: 'POST',
          data: body,
        }),
        // Counts change, configuration does not.
        invalidatesTags: ['RestCacheStats'],
      }),
    }),
    overrideExisting: false,
  });

export const {
  useGetCacheStrategyQuery,
  useGetCacheProviderQuery,
  useGetCacheStatsQuery,
  usePurgeCacheMutation,
} = api;

export { api as restCacheApi };
