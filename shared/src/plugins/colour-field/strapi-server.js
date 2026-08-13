"use strict";

/**
 * A local plugin whose only job is to register a custom field.
 *
 * Reproduces the shape reported in
 * https://github.com/strapi-community/plugin-rest-cache/issues/119: a content
 * type references a custom field owned by a plugin, and rest-cache is listed
 * *before* that plugin, so it registers first.
 */
module.exports = {
  register({ strapi }) {
    strapi.customFields.register({
      name: "colour",
      plugin: "colour-field",
      type: "string",
    });
  },
};
