import crypto from 'crypto';
import type { Context } from 'koa';

export const etagGenerate = function (ctx: Context): string {
  const type = typeof ctx.body;
  const etag = crypto
    .createHash('md5')
    .update(type === 'string' ? (ctx.body as string) : JSON.stringify(ctx.body))
    .digest('hex');

  return etag;
};
