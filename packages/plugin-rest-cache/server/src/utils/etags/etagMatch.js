'use strict';

export const etagMatch = function (ctx, etagCached) {
  const ifNoneMatch = ctx.request.headers['if-none-match'];

  if (!ifNoneMatch) {
    return false;
  }

  return ifNoneMatch.indexOf(`"${etagCached}"`) !== -1;
}
