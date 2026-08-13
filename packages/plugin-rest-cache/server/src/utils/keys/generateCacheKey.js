'use strict';

import { toLower } from 'lodash/fp';
import path from 'path';
import { generateHeadersKey } from './generateHeadersKey';
import { generateQueryParamsKey } from './generateQueryParamsKey';
import { generateAuthKey } from './generateAuthKey';

export const generateCacheKey = function (
  ctx,
  keys = {
    useQueryParams: false, // @todo: array or boolean => can be optimized
    useHeaders: [],
    useAuth: false,
  }
) {
  let querySuffix = '';
  let headersSuffix = '';
  let authSuffix = '';

  if (keys.useQueryParams !== false) {
    querySuffix = generateQueryParamsKey(ctx, keys.useQueryParams);
  }

  if (keys.useHeaders.length > 0) {
    headersSuffix = generateHeadersKey(ctx, keys.useHeaders);
  }

  if (keys.useAuth) {
    // Appended, never prefixed. Purge regexes are anchored on the route path
    // (`^/api/articles\?`), so anything in front of it would stop matching and
    // authenticated entries would silently survive every purge.
    authSuffix = generateAuthKey(ctx);
  }

  const requestPath = toLower(path.posix.normalize(ctx.request.path)).replace(
    /\/$/,
    ''
  );

  return `${requestPath}?${querySuffix}&${headersSuffix}&${authSuffix}`;
}
