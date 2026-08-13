export const deserialize = function (str: string): unknown {
  if (!str) {
    return null;
  }
  return JSON.parse(str).data;
};
