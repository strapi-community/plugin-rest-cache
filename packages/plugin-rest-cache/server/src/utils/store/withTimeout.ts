import type { Milliseconds } from '../../types/common';

/**
 * Reject promise after timeout
 *
 * @todo this is slow, we should find a way to do this in a faster way
 */
export const withTimeout = function <T>(
  callback: () => Promise<T>,
  ms: Milliseconds | number
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;

  return Promise.race([
    callback().then((result) => {
      clearTimeout(timeout);
      return result;
    }),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error('timeout'));
      }, ms);
    }),
  ]);
};
