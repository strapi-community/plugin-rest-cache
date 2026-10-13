import path from 'path';
import type { Context } from 'koa';
import { generateHeadersKey } from './generateHeadersKey';
import { generateQueryParamsKey } from './generateQueryParamsKey';
import { generateAuthKey } from './generateAuthKey';
import type { CacheKey } from '../../types/common';
import type { CacheKeysConfig } from '../../types/CacheKeysConfig';

export const generateCacheKey = function (
  ctx: Context,
  keys: CacheKeysConfig = {
    useQueryParams: false, // @todo: array or boolean => can be optimized
    useHeaders: [],
    useAuth: false,
  }
): CacheKey {
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

  // path.posix.normalize always returns a string, so lodash's toLower was
  // exactly toLowerCase here - the whole of lodash, on the per-request path,
  // for one method that String already has.
  const requestPath = path.posix
    .normalize(ctx.request.path)
    .toLowerCase()
    .replace(/\/$/, '');

  // The query and header parts escape every "&" they contain, so these two
  // are the only bare ones and a request cannot move a boundary - in
  // particular it cannot make part of its query or headers read as the auth
  // part. The path cannot carry a literal "?": ctx.request.path is still
  // percent-encoded, which is what keeps the `^/path\?` purge patterns exact.
  return `${requestPath}?${querySuffix}&${headersSuffix}&${authSuffix}` as CacheKey;
};
