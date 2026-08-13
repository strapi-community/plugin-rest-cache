import type { Context, Next } from 'koa';
import type { Core } from '@strapi/strapi';

import type { ContentTypeUID } from '../types/common';

export default function createPurge(
  options: { contentType?: ContentTypeUID | string },
  { strapi }: { strapi: Core.Strapi }
) {
  if (!options.contentType) {
    throw new Error(
      'REST Cache: unable to initialize purge middleware: options.contentType is required'
    );
  }

  const cacheConf = strapi.plugin('rest-cache').service('cacheConfig');
  const cacheStore = strapi.plugin('rest-cache').service('cacheStore');

  if (!cacheConf.isCached(options.contentType)) {
    throw new Error(
      `REST Cache: unable to initialize purge middleware: no configuration found for contentType "${options.contentType}"`
    );
  }

  return async function purge(ctx: Context, next: Next): Promise<void> {
    await next();

    if (!(ctx.status >= 200 && ctx.status <= 300)) return;

    await cacheStore.clearByUid(options.contentType, ctx.params);
  };
}
