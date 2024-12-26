'use strict';

/**
 * @typedef {import('@strapi/strapi').Strapi} Strapi
 */

/**
 * Get models uid that is related to a ModelCacheConfig
 *
 * @param {Strapi} strapi
 * @param {string} uid The contentType used to find related caches to purge
 * @return {string[]} Array of related models uid
 */
function getRelatedModelsUid(strapi, uid) {
  if (!uid) {
    return [];
  }

  let contentTypeList = [uid];
  let componentList = [];
  while (true) {
    const componentListLenght = componentList.length;
    for (const component of Object.values(strapi.components)) {
      if (componentList.includes(component.uid)) {
        continue;
      }
      for (const attribute of Object.values(component.attributes)) {
        if (attribute.type === 'relation') {
          if (
            contentTypeList.includes(attribute.target) &&
            !componentList.includes(component.uid)
          ) {
            componentList.push(component.uid);
          }
        } else if (attribute.type === 'component') {
          if (
            componentList.includes(attribute.component) &&
            !componentList.includes(component.uid)
          ) {
            componentList.push(component.uid);
          }
        }
      }
    }

    const contentTypeListLenght = contentTypeList.length;
    for (const contentType of Object.values(strapi.contentTypes)) {
      if (contentTypeList.includes(contentType.uid)) {
        continue;
      }
      for (const attribute of Object.values(contentType.attributes)) {
        if (attribute.type === 'relation') {
          if (
            contentTypeList.includes(attribute.target) &&
            !contentTypeList.includes(contentType.uid)
          ) {
            contentTypeList.push(contentType.uid);
          }
        } else if (attribute.type === 'component') {
          if (
            componentList.includes(attribute.component) &&
            !contentTypeList.includes(contentType.uid)
          ) {
            contentTypeList.push(contentType.uid);
          }
        }
      }
    }
    if (
      contentTypeListLenght === contentTypeList.length &&
      componentListLenght === componentList.length
    ) {
      return contentTypeList;
    }
  }
}

module.exports = { getRelatedModelsUid };