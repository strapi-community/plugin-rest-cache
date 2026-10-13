"use strict";

const { bootstrap } = require("./bootstrap");

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }) {
    // Opt-in fixture: an editor schema with `options.populateCreatorFields`,
    // which makes createdBy/updatedBy public, so admin user data appears in
    // its content-API responses. Set here, rather than in the schema file, so
    // no other spec's responses change. These are the two things Strapi
    // derives from the option (addCreatorFields in @strapi/core).
    if (process.env.POPULATE_CREATOR_FIELDS === "true") {
      const editor = strapi.contentTypes["api::writer.editor"];
      editor.options = { ...editor.options, populateCreatorFields: true };
      editor.attributes.createdBy.private = false;
      editor.attributes.updatedBy.private = false;
    }
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
   bootstrap
};
