'use strict';

/**
 * @param {any} data
 * @return {string}
 */
export const serialize = function (data) {
  return JSON.stringify({ data });
}
