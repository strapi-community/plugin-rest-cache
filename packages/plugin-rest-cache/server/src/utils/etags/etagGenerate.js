'use strict';

import crypto from 'crypto';

export const etagGenerate = function (ctx) {
  const type = typeof ctx.body;
  const etag = crypto
    .createHash('md5')
    .update(type === 'string' ? ctx.body : JSON.stringify(ctx.body))
    .digest('hex');

  return etag;
}
