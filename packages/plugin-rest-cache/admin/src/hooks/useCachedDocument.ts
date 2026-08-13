import {
  useRBAC,
  unstable_useContentManagerContext as useContentManagerContext,
} from '@strapi/strapi/admin';

import pluginPermissions from '../permissions';
import { useGetCacheStrategyQuery } from '../services/restCache';
import type { CacheContentTypeConfig } from '../../../server/src/types';
import type { PurgeRequest } from '../../../server/src/types/api';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * `unstable_useContentManagerContext` types `form` as `unknown`, so its shape
 * has to be established at runtime rather than asserted.
 */
const getInitialValues = (form: unknown): Record<string, unknown> => {
  if (isRecord(form) && isRecord(form.initialValues)) {
    return form.initialValues;
  }

  return {};
};

/**
 * Reduce a document's values to the ones that can appear in a cache key.
 *
 * Keys are built by interpolating these into route paths, so only scalars mean
 * anything; a relation or a component would stringify to `[object Object]` and
 * match nothing.
 */
const toPurgeParams = (values: Record<string, unknown>): PurgeRequest['params'] => {
  const params: Record<string, string | number> = {};

  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string' || typeof value === 'number') {
      params[key] = value;
    }
  }

  return params;
};

export interface CachedDocument {
  /**
   * Whether a purge control should be offered for the document currently open.
   *
   * False for an entry that cannot have cached responses - one being created,
   * or a draft that was never served over the REST API - for a content type
   * that is not in the configured strategy, and for an admin without the
   * permissions to see or act on any of it.
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
 * Both the document action and the side panel ran the same four guards and the
 * same strategy lookup. Sharing it means they cannot disagree about whether a
 * document is cached - which would show a purge button beside a panel saying
 * the entry is not cached, or the reverse.
 */
export const useCachedDocument = (model: string): CachedDocument => {
  const { allowedActions } = useRBAC(pluginPermissions);
  const { data } = useGetCacheStrategyQuery();
  const { isCreatingEntry, form, isSingleType } = useContentManagerContext();

  const initialValues = getInitialValues(form);
  const config = data?.strategy?.contentTypes?.find(
    (contentType) => contentType.contentType === model
  );

  // Both components previously also tested
  // `hasDraftAndPublish && initialValues.publishedAt === null`, meaning "this
  // is a draft, so nothing was ever served over REST". That condition could
  // never be true: the edit form's values hold only the content type's own
  // fields - documentId, title, description and so on - and `publishedAt` is
  // not among them, so the comparison was always `undefined === null`.
  //
  // Removed rather than reimplemented against `document.status`, because
  // hiding on drafts is not clearly right: a "modified" document has both a
  // published version that is cached and unpublished edits, and that is
  // exactly when someone needs to purge. Offering the control for a document
  // with nothing cached costs a no-op request; withholding it when there is
  // something cached leaves stale content served with no way to clear it.
  const isEligible =
    !isCreatingEntry &&
    allowedActions.canReadStrategy === true &&
    allowedActions.canPurge === true &&
    config !== undefined;

  return {
    isEligible,
    config,
    params: isSingleType ? {} : toPurgeParams(initialValues),
    isSingleType,
  };
};
