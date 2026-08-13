import type { Context } from 'koa';

import type { CachePluginHitpass } from '../../types/common';

export const shouldLookup = async function (
  ctx: Context,
  hitpass: CachePluginHitpass | boolean // @todo: function or boolean => can be optimized
): Promise<boolean> {
  const type = typeof hitpass;

  if (type === 'boolean') {
    return !hitpass;
  }

  if (type === 'function') {
    return !(await (hitpass as CachePluginHitpass)(ctx));
  }

  return false;
};
