import type { CacheEntryMeta } from './serialize';

/** A stored response: its body, and whatever else was kept with it. */
export interface CacheEntry extends CacheEntryMeta {
  data: unknown;
}

export const deserializeEntry = function (str: string): CacheEntry | null {
  if (!str) {
    return null;
  }

  const { data, type } = JSON.parse(str);

  // Entries written before the type was kept have no `type`, and must be served
  // exactly as they always were - so an absent or malformed one is dropped
  // rather than guessed at, and the caller leaves the type to Koa.
  if (typeof type === 'string' && type !== '') {
    return { data, type };
  }

  return { data };
};
