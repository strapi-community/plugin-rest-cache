'use strict';

/**
 * @param {string} str
 * @return {any}
 */
export const deserialize = function (str) {
  if (!str) {
    return null;
  }
  return JSON.parse(str).data;
}
