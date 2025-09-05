'use strict';

import { toLower } from 'lodash/fp';
import path from 'path';
import { generateHeadersKey } from './generateHeadersKey';
import { generateQueryParamsKey } from './generateQueryParamsKey';

export const generateCacheKey = function (
  ctx,
  keys = {
    useQueryParams: false, // @todo: array or boolean => can be optimized
    useHeaders: [],
  }
) {
  let querySuffix = '';
  let headersSuffix = '';

  if (keys.useQueryParams !== false) {
    querySuffix = generateQueryParamsKey(ctx, keys.useQueryParams);
  }

  if (keys.useHeaders.length > 0) {
    headersSuffix = generateHeadersKey(ctx, keys.useHeaders);
  }

  const requestPath = toLower(path.posix.normalize(ctx.request.path)).replace(
    /\/$/,
    ''
  );

  return `${requestPath}?${querySuffix}&${headersSuffix}`;
}
