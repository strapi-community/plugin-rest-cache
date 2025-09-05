'use strict';

export const shouldLookup = async function (
  ctx,
  hitpass // @todo: function or boolean => can be optimized
) {
  const type = typeof hitpass;

  if (type === 'boolean') {
    return !hitpass;
  }

  if (type === 'function') {
    return !(await hitpass(ctx));
  }

  return false;
};
