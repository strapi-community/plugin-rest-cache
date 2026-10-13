import { AsyncLocalStorage } from 'node:async_hooks';
import type { Core } from '@strapi/strapi';
import debug from 'debug';

import colors from '../colors';
import type { WriteAction } from '../../types/common';

/**
 * Document service actions that change content and must therefore invalidate
 * the cache. The middleware also runs for reads (findMany, findOne, count...),
 * so this filter is mandatory - without it every cache hit would immediately
 * invalidate itself.
 *
 * Typed as WriteAction so this set and the minting/targeted split below cannot
 * drift apart: adding an action to one without the other is a compile error.
 */
const WRITE_ACTIONS = new Set<WriteAction>([
  'create',
  'clone',
  'update',
  'delete',
  'publish',
  'unpublish',
  'discardDraft',
]);

/**
 * The content type uids with a document service write in progress on the
 * current async call chain.
 *
 * The document service writes through strapi.db.query, so every write it makes
 * also fires database lifecycles. The database lifecycle purge
 * (registerDatabaseLifecyclePurge) exists for writes that bypass the document
 * service; it asks this whether a lifecycle event belongs to a write the
 * middleware below will already purge, so that write is purged once rather
 * than once per row the document service touches (draft, published version,
 * each locale).
 *
 * AsyncLocalStorage rather than a process-wide "write in flight" flag: only
 * the database events of this very call see the scope. A user.remove() from
 * another request that overlaps a slow user update must still purge, or the
 * removed user stays in the cached list until maxAge.
 *
 * Scoped by uid rather than "any document service write": a document service
 * write to one content type that makes a raw strapi.db.query write to a
 * different cached one is not purged for that other one by this middleware.
 */
const documentServiceWrites = new AsyncLocalStorage<ReadonlySet<string>>();

export const isDocumentServiceWriteInProgress = (uid: string): boolean =>
  documentServiceWrites.getStore()?.has(uid) ?? false;

interface DocumentServiceContext {
  action: string;
  uid: string;
  params?: { documentId?: string };
}

/**
 * `create` and `clone` mint a new documentId, so it only exists on the result.
 * Every other action carries it on the params.
 */
function resolveDocumentId(
  ctx: DocumentServiceContext,
  result: unknown
): string | undefined {
  if (ctx.action === 'create' || ctx.action === 'clone') {
    return (result as { documentId?: string })?.documentId;
  }

  return ctx.params?.documentId;
}

/**
 * Invalidate the cache from the document service rather than from HTTP routes.
 *
 * Every write funnels through the document service - REST, GraphQL, the admin
 * content-manager, the deprecated entity service, scheduled Content Releases,
 * review workflows and any custom `strapi.documents()` call - so this catches
 * writes that no route middleware can see, and cannot drift out of sync with
 * Strapi's route list the way a hardcoded set of paths does.
 *
 * @see https://github.com/strapi-community/plugin-rest-cache/issues/129
 */
export const registerDocumentServiceMiddleware = function (strapi: Core.Strapi): void {
  debug('strapi:plugin-rest-cache')(
    `[REGISTER] ${colors.blueBright('document service')} invalidation middleware`
  );

  strapi.documents.use(async (ctx, next) => {
    if (!WRITE_ACTIONS.has(ctx.action as WriteAction)) {
      return next();
    }

    const inProgress = new Set(documentServiceWrites.getStore());
    inProgress.add(ctx.uid);
    const result = await documentServiceWrites.run(inProgress, () => next());

    const cacheConfig = strapi.plugin('rest-cache').service('cacheConfig');

    if (!cacheConfig.isCached(ctx.uid)) {
      return result;
    }

    const cacheStore = strapi.plugin('rest-cache').service('cacheStore');
    const documentId = resolveDocumentId(ctx as DocumentServiceContext, result);

    debug('strapi:plugin-rest-cache')(
      `${colors.redBright('[PURGE]')} ${ctx.action} ${colors.cyan(ctx.uid)}${
        documentId ? ` documentId=${documentId}` : ' (wildcard)'
      }`
    );

    // Purge before returning, so a client that writes and immediately reads
    // sees fresh content. This has to be awaited here rather than deferred to
    // `strapi.db.transaction(({ onCommit }) => ...)`: Strapi runs commit
    // callbacks with `store.commitCallbacks.forEach((cb) => cb())` and never
    // awaits them, so an async purge registered that way is fire-and-forget.
    // The write would then race the purge - reliably lost on the redis
    // provider, where a purge is a SCAN plus a round trip per key.
    //
    // The trade-off: content-manager bulk operations wrap their loop in a
    // transaction, so here the purge lands before that outer commit. A read
    // arriving in that window can repopulate from pre-commit state. That race
    // is the pre-existing one tracked in #132 and applies equally to the route
    // middleware this replaced; an unawaited purge would hit it on every write
    // rather than only inside bulk operations.
    try {
      // Without a documentId we cannot scope the purge, so clear every entry
      // for the content type.
      await cacheStore.clearByUid(
        ctx.uid,
        documentId ? { id: documentId } : {},
        !documentId
      );
    } catch (error) {
      // A failed purge must never fail the write that triggered it.
      strapi.log.error(`REST Cache: failed to purge "${ctx.uid}" after "${ctx.action}"`);
      strapi.log.error(error);
    }

    return result;
  });
};
