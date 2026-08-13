import type { Context } from 'koa';

export const generateHeadersKey = function (
  ctx: Context,
  useHeaders: string[] = []
): string {
  // One pass, lowercasing each name once instead of three times per request,
  // and without the intermediate array the filter/map chain allocated.
  const parts: string[] = [];

  for (const name of useHeaders) {
    const header = name.toLowerCase(); // headers are key insensitive
    const value = ctx.request.header[header];

    if (value !== undefined) {
      parts.push(`${header}=${value}`);
    }
  }

  return parts.join(',');
};
