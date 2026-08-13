/**
 * API reference generation for the docs site.
 *
 * The output is committed under docs/guide/reference/api so the docs build
 * does not need to compile the plugin. Regenerate with `pnpm run docs:api`
 * whenever the public types change; CI checks that it is up to date.
 */
export default {
  // The public type surface only. This is what a consumer imports as
  // `@strapi-community/plugin-rest-cache/types` when writing a custom provider
  // or typing their own configuration - not the plugin's internals.
  entryPoints: ['packages/plugin-rest-cache/server/src/types/index.ts'],
  tsconfig: 'packages/plugin-rest-cache/server/tsconfig.json',

  plugin: ['typedoc-plugin-markdown'],
  out: 'docs/guide/reference/api',

  // index.md, not the default README.md, so the entry point is reachable at
  // /guide/reference/api/ rather than /guide/reference/api/README.html.
  entryFileName: 'index.md',

  // Default file strategy (a page per member). `modules` collapses to a single
  // page but errors with one entry point.
  mergeReadme: false,
  hidePageHeader: true,
  hideBreadcrumbs: true,
  useCodeBlocks: true,
  expandObjects: true,
  parametersFormat: 'table',
  propertiesFormat: 'table',
  enumMembersFormat: 'table',
  typeDeclarationFormat: 'table',

  // Brand is a private helper that CacheKey and friends are built from. It is
  // deliberately not exported, and saying so keeps the run warning-free.
  intentionallyNotExported: ['Brand'],

  excludeInternal: true,
  excludePrivate: true,
  readme: 'none',
  // Link source to the branch, not the commit TypeDoc happened to run on.
  // A SHA is a truer permalink, but it rewrites every source link on every
  // regeneration, so the committed output churns for no reader benefit.
  gitRevision: 'main',

  githubPages: false,
};
