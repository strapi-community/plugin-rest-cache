import type { Core } from '@strapi/strapi';
import debug from 'debug';

import colors from '../colors';
import { isDocumentServiceWriteInProgress } from './registerDocumentServiceMiddleware';

/**
 * Database lifecycles that follow a write. Only the `after*` hooks: purging
 * before the write lands would let a concurrent read repopulate the entry from
 * the old row.
 */
const WRITE_LIFECYCLES = [
  'afterCreate',
  'afterCreateMany',
  'afterUpdate',
  'afterUpdateMany',
  'afterDelete',
  'afterDeleteMany',
] as const;

interface LifecycleEvent {
  action: string;
  model: { uid: string };
  result?: unknown;
}

/**
 * Purge on writes made with strapi.db.query, which the document service
 * middleware never sees.
 *
 * Several plugins write their own content types that way: users-permissions'
 * `user.remove`, upload's file create, update and remove, i18n's locales. While
 * plugin content-api routes could not be cached that did not matter; once a
 * listed `/api/users` or `/api/upload/files` is cached, a user deleted through
 * `DELETE /api/users/:id` stayed in the cached list until maxAge.
 *
 * Subscribed only for cached content types owned by a plugin. Application
 * content types are written through the document service by Strapi itself;
 * a strapi.db.query write to one is the application's own code, documented as
 * needing an explicit clearByUid (docs/guide/invalidation/purging.md). Hooking
 * those too would change nothing for correct code except to add a wildcard
 * purge per row to every bulk import that loops over strapi.db.query, which
 * on redis is a SCAN each - a purge storm in exchange for a purge the code
 * already does once at the end.
 *
 * An event is ignored while a document service write to the same content type
 * is in progress: the document service writes through strapi.db.query too
 * (users-permissions creates and updates users that way), and its middleware
 * already purges that write once, with a documentId-scoped purge where it can.
 * Without that check a single document service write would purge two or more
 * times (draft, published version, each locale).
 *
 * The purge is a wildcard for the content type. A database event carries no
 * route params, and plugin routes are not keyed by documentId anyway
 * (`/api/users/:id` is the numeric id), so a scoped purge could miss the entry
 * it was meant for. `*Many` actions fire one event per call, not per row, and
 * one that touched nothing is skipped, so a bulk write costs one purge.
 *
 * Related content types are handled by clearByUid exactly as for a document
 * service write, so `clearRelatedCache` applies the same way.
 *
 * Only registered alongside the document service middleware: with
 * `enableDocumentServiceMiddleware: false` invalidation is route based by
 * choice, and adding database-level purges there would purge routed writes
 * twice.
 */
export const registerDatabaseLifecyclePurge = function (strapi: Core.Strapi): void {
  const cacheConfig = strapi.plugin('rest-cache').service('cacheConfig');
  const models = cacheConfig.getUids().filter((uid) => uid.startsWith('plugin::'));

  if (!models.length) {
    return;
  }

  debug('strapi:plugin-rest-cache')(
    `[REGISTER] ${colors.blueBright('database lifecycle')} invalidation for ${models.length} content type(s)`
  );

  const purge = async (event: LifecycleEvent): Promise<void> => {
    const { uid } = event.model;

    if (isDocumentServiceWriteInProgress(uid) || !cacheConfig.isCached(uid)) {
      return;
    }

    if (
      event.action.endsWith('Many') &&
      (event.result as { count?: number } | undefined)?.count === 0
    ) {
      return;
    }

    debug('strapi:plugin-rest-cache')(
      `${colors.redBright('[PURGE]')} db ${event.action} ${colors.cyan(uid)} (wildcard)`
    );

    try {
      await strapi.plugin('rest-cache').service('cacheStore').clearByUid(uid, {}, true);
    } catch (error) {
      // A failed purge must never fail the write that triggered it.
      strapi.log.error(`REST Cache: failed to purge "${uid}" after database "${event.action}"`);
      strapi.log.error(error);
    }
  };

  strapi.db.lifecycles.subscribe({
    models,
    ...Object.fromEntries(WRITE_LIFECYCLES.map((action) => [action, purge])),
  });
};
