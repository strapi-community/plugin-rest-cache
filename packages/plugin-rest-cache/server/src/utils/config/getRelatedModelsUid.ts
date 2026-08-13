import type { Core } from '@strapi/strapi';

import type { ContentTypeUID } from '../../types/common';

/**
 * The parts of a schema this traversal actually reads.
 *
 * Typed structurally rather than as Strapi's own Schema, because that type
 * models every attribute kind and only two of them - relation and component -
 * can carry a dependency from one model to another.
 */
interface TraversableSchema {
  uid: string;
  attributes: Record<
    string,
    {
      type: string;
      /** Set on relation attributes: the uid this relation points at. */
      target?: string;
      /** Set on component attributes: the uid of the embedded component. */
      component?: string;
    }
  >;
}

/**
 * Get models uid that is related to a ModelCacheConfig
 *
 * Runs to a fixed point rather than a single pass: a content type can reach
 * another through a chain of components, so each round can discover models that
 * make a further model reachable. The loop ends when a full round adds nothing.
 *
 * @param uid The contentType used to find related caches to purge
 * @return Array of related models uid
 */
export const getRelatedModelsUid = function (
  strapi: Pick<Core.Strapi, 'components' | 'contentTypes'>,
  uid: ContentTypeUID | string
): string[] {
  if (!uid) {
    return [];
  }

  // Strapi models an attribute as a discriminated union covering every kind,
  // and `target` / `component` live on only two of its members. Projecting to
  // TraversableSchema states plainly which two this traversal cares about
  // instead of narrowing the union at each of the four access sites.
  const allComponents = Object.values(strapi.components) as unknown as TraversableSchema[];
  const allContentTypes = Object.values(
    strapi.contentTypes
  ) as unknown as TraversableSchema[];

  const contentTypeList: string[] = [uid];
  const componentList: string[] = [];

  while (true) {
    const componentListLength = componentList.length;
    for (const component of allComponents) {
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

    const contentTypeListLength = contentTypeList.length;
    for (const contentType of allContentTypes) {
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
      contentTypeListLength === contentTypeList.length &&
      componentListLength === componentList.length
    ) {
      return contentTypeList;
    }
  }
};
