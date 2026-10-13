import type { Core } from '@strapi/strapi';
import debug from 'debug';

import colors from '../colors';
import { getRelatedModelsUid } from '../config/getRelatedModelsUid';
import type { WriteAction } from '../../types/common';
import type { RestCachePluginConfig } from '../../types/config';

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

  /**
   * Cached content types whose responses can embed an uncached one, by uid.
   *
   * A content type that is not configured for caching has no entries of its
   * own, but cached responses can still contain it - `/api/articles?populate=author`
   * embeds a writer whether or not writers are cached. Returning early on an
   * uncached write left those responses stale until maxAge, although
   * clearRelatedCache promises they are purged.
   *
   * Same direction as a cached type's relatedContentTypeUid: the content types
   * that reach the written one through relations, components and dynamic zones,
   * which are the ones whose responses can contain it. Filled lazily, once per
   * written uid, because the schema cannot change after boot and most uncached
   * content types are never written to; an empty list keeps a write to an
   * uncached type nobody embeds as cheap as it was.
   *
   * Private attributes are skipped. Every content type has createdBy/updatedBy
   * relations to admin::user, and the admin types relate to one another, so
   * otherwise a document-service write to admin::user, role, permission,
   * api-token or api-token-permission reached every cached type and flushed
   * the whole cache. Those relations are private - createdBy/updatedBy unless
   * the schema sets `options.populateCreatorFields`, admin::user.roles always -
   * and the content-API sanitizer removes private attributes, so they never
   * put admin data into a cached response. With populateCreatorFields the
   * creator fields are public, and an admin user write still purges that type.
   * The cached path keeps its own related set, unchanged.
   */
  const embeddedIn = new Map<string, string[]>();

  const cachedTypesEmbedding = (uid: string): string[] => {
    let uids = embeddedIn.get(uid);

    if (!uids) {
      const cacheConfig = strapi.plugin('rest-cache').service('cacheConfig');
      uids = getRelatedModelsUid(strapi, uid, { ignorePrivate: true }).filter(
        (relatedUid) => relatedUid !== uid && cacheConfig.isCached(relatedUid)
      );
      embeddedIn.set(uid, uids);
    }

    return uids;
  };

  strapi.documents.use(async (ctx, next) => {
    const result = await next();

    if (!WRITE_ACTIONS.has(ctx.action as WriteAction)) {
      return result;
    }

    const cacheConfig = strapi.plugin('rest-cache').service('cacheConfig');
    const cacheStore = strapi.plugin('rest-cache').service('cacheStore');

    if (!cacheConfig.isCached(ctx.uid)) {
      const { strategy } = strapi.config.get<RestCachePluginConfig>('plugin::rest-cache');

      // Behind the same flag as every other related purge: with it off, a
      // write purges only the content type written, and that has no entries.
      if (!strategy.clearRelatedCache) {
        return result;
      }

      const related = cachedTypesEmbedding(ctx.uid);

      if (!related.length) {
        return result;
      }

      debug('strapi:plugin-rest-cache')(
        `${colors.redBright('[PURGE]')} ${ctx.action} ${colors.cyan(ctx.uid)} (uncached) related: ${related.join(', ')}`
      );

      // Awaited, and never allowed to fail the write, for the same reasons as
      // the purge below. Wildcard, as for any related purge: nothing says which
      // of their entries embedded this document.
      try {
        await cacheStore.clearByRegexp(
          related.flatMap((relatedUid) =>
            cacheConfig.getCacheKeysRegexp(relatedUid, {}, true)
          )
        );
      } catch (error) {
        strapi.log.error(
          `REST Cache: failed to purge content types related to "${ctx.uid}" after "${ctx.action}"`
        );
        strapi.log.error(error);
      }

      return result;
    }

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
