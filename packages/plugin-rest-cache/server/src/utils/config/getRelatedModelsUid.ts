import type { Core } from '@strapi/strapi';

import type { ContentTypeUID } from '../../types/common';

/**
 * The parts of a schema this traversal actually reads.
 *
 * Typed structurally rather than as Strapi's own Schema, because that type
 * models every attribute kind and only two of them - relation and component -
 * can carry a dependency from one model to another.
 */
interface TraversableAttribute {
  type: string;
  /** Set on relation attributes: the uid this relation points at. */
  target?: string;
  /** Set on component attributes: the uid of the embedded component. */
  component?: string;
}

interface TraversableSchema {
  uid: string;
  attributes: Record<string, TraversableAttribute>;
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

  // Sets rather than arrays. Membership is tested once per attribute inside a
  // loop that already runs (models x attributes) per round, and the round count
  // grows with the depth of the component nesting - so an O(n) Array.includes
  // at the innermost point made boot time quadratic in the size of the schema.
  // Insertion order is preserved either way, so the returned order is unchanged.
  const contentTypeUids = new Set<string>([uid]);
  const componentUids = new Set<string>();

  /** Whether this attribute reaches something already known to be related. */
  const reachesKnown = (attribute: TraversableAttribute): boolean =>
    (attribute.type === 'relation' && contentTypeUids.has(attribute.target)) ||
    (attribute.type === 'component' && componentUids.has(attribute.component));

  for (;;) {
    const knownBefore = contentTypeUids.size + componentUids.size;

    for (const component of allComponents) {
      if (componentUids.has(component.uid)) {
        continue;
      }
      for (const attribute of Object.values(component.attributes)) {
        if (reachesKnown(attribute)) {
          componentUids.add(component.uid);
          // Nothing further this component declares can add it a second time.
          break;
        }
      }
    }

    for (const contentType of allContentTypes) {
      if (contentTypeUids.has(contentType.uid)) {
        continue;
      }
      for (const attribute of Object.values(contentType.attributes)) {
        if (reachesKnown(attribute)) {
          contentTypeUids.add(contentType.uid);
          break;
        }
      }
    }

    if (contentTypeUids.size + componentUids.size === knownBefore) {
      return [...contentTypeUids];
    }
  }
};
