'use strict';

export const generateHeadersKey = function (ctx, useHeaders = []) {
  return useHeaders
    .filter((k) => ctx.request.header[k.toLowerCase()] !== undefined)
    .map((k) => `${k.toLowerCase()}=${ctx.request.header[k.toLowerCase()]}`) // headers are key insensitive
    .join(',');
}
