import type { Context } from 'koa';

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

  return keys
    .map(
      (k) =>
        `${k}=${
          typeof ctx.query[k] === 'object'
            ? JSON.stringify(ctx.query[k])
            : ctx.query[k]
        }`
    ) // query strings are key sensitive
    .join(',');
};
