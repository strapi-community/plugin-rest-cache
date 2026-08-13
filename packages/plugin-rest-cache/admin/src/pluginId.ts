import pluginPkg from '../../package.json';

/**
 * Derived from package.json rather than hardcoded, so the two cannot disagree.
 * The server resolves the same id the same way.
 */
export const pluginId = pluginPkg.strapi.name;

export default pluginId;
