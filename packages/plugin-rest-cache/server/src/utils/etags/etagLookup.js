'use strict';

export const etagLookup = async function (cacheKey) {
  const store = strapi.plugin('rest-cache').service('cacheStore');
  const etagCached = await store.get(`${cacheKey}_etag`);

  if (etagCached) {
    return etagCached;
  }

  return null;
}
