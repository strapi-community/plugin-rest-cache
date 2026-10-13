import type { Context } from 'koa';
import { KEY_NULL, escapeKeyJson, escapeKeyName, escapeKeyValue } from './escapeKeyPart';

export const generateQueryParamsKey = function (
  ctx: Context,
  useQueryParams: boolean | string[] = true // @todo: array or boolean => can be optimized
): string {
  let keys: string[] = [];

  if (useQueryParams === true) {
    keys = Object.keys(ctx.query);
  } else if ((useQueryParams as string[]).length > 0) {
    keys = Object.keys(ctx.query).filter((key) =>
      (useQueryParams as string[]).includes(key)
    );
  }

  if (keys.length === 0) {
    return '';
  }

  keys.sort();

  // Names and values are escaped so one parameter cannot spell out a second:
  // `?locale=x,populate=a` must not share a key with `?locale=x&populate=a`.
  // See escapeKeyPart.ts for why an ordinary value comes out unchanged.
  return keys
    .map((k) => {
      const value = ctx.query[k];

      // null is tested first: `typeof null` is "object", and as JSON it would
      // key as `null`, the same as the string `?q=null`.
      if (value === null) {
        return `${escapeKeyName(k)}=${KEY_NULL}`;
      }

      return `${escapeKeyName(k)}=${
        typeof value === 'object'
          ? JSON.stringify(escapeKeyJson(value))
          : escapeKeyValue(`${value}`)
      }`;
    }) // query strings are key sensitive
    .join(',');
};
