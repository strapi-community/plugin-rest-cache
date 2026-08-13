import type { Context } from 'koa';

export const generateHeadersKey = function (
  ctx: Context,
  useHeaders: string[] = []
): string {
  return useHeaders
    .filter((k) => ctx.request.header[k.toLowerCase()] !== undefined)
    .map((k) => `${k.toLowerCase()}=${ctx.request.header[k.toLowerCase()]}`) // headers are key insensitive
    .join(',');
};
