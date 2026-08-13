import { pluginId } from '../pluginId';

/**
 * Namespace a translation key with the plugin id.
 *
 * Every `formatMessage` call goes through this rather than writing
 * "rest-cache.some.key" inline, so the plugin id lives in exactly one place.
 */
export const getTranslation = (id: string): string => `${pluginId}.${id}`;

/**
 * Prefix a whole translation file.
 *
 * Vendored because Strapi 5 stopped exporting it from @strapi/helper-plugin.
 */
export const prefixPluginTranslations = (
  translations: Record<string, string>,
  id: string
): Record<string, string> => {
  if (!id) {
    throw new TypeError("pluginId can't be empty");
  }

  return Object.keys(translations).reduce<Record<string, string>>((acc, current) => {
    acc[`${id}.${current}`] = translations[current];
    return acc;
  }, {});
};
