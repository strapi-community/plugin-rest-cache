import type { Context, Next } from 'koa';
import type { Core } from '@strapi/strapi';

export default function createPurgeAdmin(
  options: Record<string, never>,
  { strapi }: { strapi: Core.Strapi }
) {
  const cacheConfig = strapi.plugin('rest-cache').service('cacheConfig');
  const cacheStore = strapi.plugin('rest-cache').service('cacheStore');

  return async function purgeAdmin(ctx: Context, next: Next): Promise<void> {
    // uid:
    // - application::sport.sport
    // - plugins::users-permissions.user
    const { model: uid, ...params } = ctx.params;

    if (!uid) {
      await next();
      return;
    }

    if (!cacheConfig.isCached(uid)) {
      await next();
      return;
    }

    await next();

    if (!(ctx.status >= 200 && ctx.status <= 300)) return;

    await cacheStore.clearByUid(uid, params);
  };
}
