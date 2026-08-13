import type { CacheKey } from '../../types/common';

export const etagLookup = async function (
  cacheKey: CacheKey
): Promise<string | null> {
  const store = strapi.plugin('rest-cache').service('cacheStore');
  const etagCached = (await store.get(`${cacheKey}_etag`)) as string | null;

  if (etagCached) {
    return etagCached;
  }

  return null;
};
