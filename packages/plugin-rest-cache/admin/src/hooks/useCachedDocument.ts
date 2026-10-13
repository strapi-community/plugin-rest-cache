import { useCacheStrategy } from '../services/restCache';
import type { CacheContentTypeConfig } from '../../../server/src/types';
import type { PurgeRequest } from '../../../server/src/types/api';
import type { EditViewContext } from '../types/contentManager';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Reduce a document's values to the ones that can appear in a cache key.
 *
 * Keys are built by interpolating these into route paths, so only scalars mean
 * anything; a relation or a component would stringify to `[object Object]` and
 * match nothing.
 */
const toPurgeParams = (values: unknown): PurgeRequest['params'] => {
  const params: Record<string, string | number> = {};

  if (!isRecord(values)) {
    return params;
  }

  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string' || typeof value === 'number') {
      params[key] = value;
    }
  }

  return params;
};

/**
 * The route params that address this entry in the REST API.
 *
 * `:id` in a Strapi 5 REST route is the documentId - `/api/articles/:id` is
 * requested as `/api/articles/<documentId>`, and that is what the cache key
 * holds. The document's own `id` field is the numeric database row id, which
 * never appears in a URL, so passing the document through as-is purged a key
 * that cannot exist. With clearRelatedCache on that went unnoticed, because a
 * content type is related to itself and its routes are wildcarded anyway; with
 * it off, the edit-view purge removed nothing for the entry it was opened on.
 *
 * The other scalar fields stay, so a custom route such as `/api/articles/:slug`
 * is still narrowed to this entry. The server's document service middleware
 * scopes its own purges the same way, with `{ id: documentId }`.
 */
const toEntryParams = (values: unknown, documentId?: string): PurgeRequest['params'] => {
  const params = toPurgeParams(values) ?? {};

  if (documentId) {
    params.id = documentId;
  }

  return params;
};

export interface CachedDocument {
  /**
   * Whether a purge control should be offered for the document currently open.
   *
   * False while an entry is being created - nothing has been written, so
   * nothing can be cached - and for a content type that is not in the
   * configured strategy.
   */
  isEligible: boolean;
  /** The strategy entry for this content type, when there is one. */
  config?: CacheContentTypeConfig;
  /** Route params to scope the purge by. Empty for a single type. */
  params: PurgeRequest['params'];
  /** Single types have one entry and no params, so their purge is a wildcard. */
  isSingleType: boolean;
}

/**
 * Everything the two edit-view contributions need to decide whether to appear.
 *
 * Reads the context from the props the content-manager already passes rather
 * than from `unstable_useContentManagerContext`. That hook is only valid
 * inside the edit view, but Strapi evaluates registered document actions on
 * the **list** view as well - and calling it there throws, which the error
 * boundary turns into "Something went wrong" for the whole content-manager
 * list. Every field needed here is on the props anyway.
 *
 * Nothing here reads the Auth context either: it is unreachable from a
 * plugin's prebuilt chunk in a production admin build (see
 * services/restCache), and the server enforces the same permissions on every
 * route it exposes.
 */
export const useCachedDocument = ({
  model,
  document,
  documentId,
  collectionType,
}: EditViewContext): CachedDocument => {
  const { data } = useCacheStrategy();

  const config = data?.strategy?.contentTypes?.find(
    (contentType) => contentType.contentType === model
  );

  const isSingleType = collectionType === 'single-types';

  return {
    // Nothing has been written yet, so nothing can be cached.
    isEligible: Boolean(documentId) && config !== undefined,
    config,
    params: isSingleType ? {} : toEntryParams(document, documentId),
    isSingleType,
  };
};
