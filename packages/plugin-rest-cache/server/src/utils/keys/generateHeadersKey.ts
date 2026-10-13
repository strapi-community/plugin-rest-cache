import type { Context } from 'koa';
import { escapeKeyName, escapeKeyValue } from './escapeKeyPart';

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
      // Escaped so a value like `fr,x-b=1` cannot pose as a second configured
      // header, nor an "&" move the boundary into the auth part. See
      // escapeKeyPart.ts for why an ordinary value comes out unchanged.
      parts.push(`${escapeKeyName(header)}=${escapeKeyValue(`${value}`)}`);
    }
  }

  return parts.join(',');
};
