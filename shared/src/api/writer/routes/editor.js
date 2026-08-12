"use strict";

/**
 * editor router.
 *
 * Deliberately lives under the `writer` API while describing the `editor`
 * content type, so the plugin is exercised against a content type whose
 * singular name does not match its parent API.
 */

const { createCoreRouter } = require("@strapi/strapi").factories;

module.exports = createCoreRouter("api::writer.editor");
