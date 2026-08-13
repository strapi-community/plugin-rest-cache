import type { Context } from 'koa';

export const etagMatch = function (ctx: Context, etagCached: string): boolean {
  const ifNoneMatch = ctx.request.headers['if-none-match'];

  if (!ifNoneMatch) {
    return false;
  }

  return ifNoneMatch.indexOf(`"${etagCached}"`) !== -1;
};
