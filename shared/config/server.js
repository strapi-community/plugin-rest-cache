"use strict";

module.exports = ({ env }) => ({
  host: env("HOST", "0.0.0.0"),
  port: env.int("PORT", 1337),
  app: {
    keys: env.array("APP_KEYS", ["testKey1", "testKey2"]),
  },
  // Strapi's MCP endpoint is opt-in, and must stay off here.
  //
  // The content-manager derives MCP tool names with slugifyUidForMcpToolName,
  // which for "api::x.y" returns only the API segment and discards the content
  // type. This playground has api::writer.writer and api::writer.editor, so
  // both derive the name "writer" and registration throws:
  //
  //   [MCP] tool with name "list_writer" is already registered.
  //
  // That takes the whole application down at bootstrap. It affects any Strapi
  // 5.52 app with two content types in one API - the same class of bug as
  // plugin-rest-cache#125, identity derived from the API name rather than the
  // content type.
  //
  // Set ENABLE_MCP=true to reproduce it.
  mcp: {
    enabled: env.bool("ENABLE_MCP", false),
  },
});
