/**
 * Recursively freeze an object and everything reachable from it.
 *
 * The resolved strategy is handed to user code (hitpass callbacks, the admin
 * controllers) and must not be mutable from there, since a mutation would
 * silently change caching behaviour for every subsequent request.
 */
export const deepFreeze = function <T>(object: T): Readonly<T> {
  // Retrieve the property names defined on object
  const propNames = Object.getOwnPropertyNames(object);

  // Freeze properties before freezing self
  for (const name of propNames) {
    const value = (object as Record<string, unknown>)[name];

    if (value && typeof value === 'object') {
      deepFreeze(value);
    }
  }

  return Object.freeze(object);
};
