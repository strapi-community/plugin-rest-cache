import { createRequire } from 'module'
import defineVersionedConfig from 'vitepress-versioning-plugin-patched'
import { withMermaid } from 'vitepress-plugin-mermaid'

const require = createRequire(import.meta.url)
const pkg = require('@strapi-community/plugin-rest-cache/package.json')

// withMermaid wraps the resolved config rather than replacing defineVersionedConfig:
// the versioning plugin needs __dirname and has to run first, and mermaid only
// adds the renderer plugin and a client-side import on top of whatever it is given.
export default withMermaid(defineVersionedConfig({
  title: "REST Cache",
  description: "Speed-up HTTP requests with LRU cache",
  base: "/plugin-rest-cache/",
  lastUpdated: true,
  versioning: {
    latestVersion: pkg.version,
  },
  // mermaid reaches dayjs, which ships as UMD. Without pre-bundling it, Vite's
  // dev server hands the page a module with no `default` export, the page
  // bundle throws on load, and NOTHING hydrates - a blank docs site, not a
  // missing diagram. `vitepress build` pre-bundles differently and is unaffected,
  // so this only ever breaks `pnpm run docs:dev`.
  vite: {
    optimizeDeps: {
      include: ['mermaid', 'dayjs'],
    },
    ssr: {
      noExternal: ['mermaid'],
    },
  },

  themeConfig: {
    versionSwitcher: false,
    socialLinks: [
      { icon: 'github', link: 'https://github.com/strapi-community/plugin-rest-cache' },
    ],
    editLink: {
      pattern: 'https://github.com/strapi-community/plugin-rest-cache/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },
    logo: {
      src: "/icon.png",
    },
    outline: [2,3],
    footer: {
      message: 'Made with ❤️ by <a href="https://github.com/strapi-community/">Strapi Community</a>'
    },
    nav: [
      {
        text: "Guide",
        link: "/guide/",
        activeMatch: '/guide/',
      },
      {
        component: 'VersionSwitcher',
      }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Getting started', link: '/guide/getting-started' },
          ]
        },
        {
          text: 'Caching',
          collapsible: true,
          items: [
            { text: 'How caching works', link: '/guide/caching/' },
            { text: 'Content types', link: '/guide/caching/content-types' },
            { text: 'Custom routes', link: '/guide/caching/custom-routes' },
            { text: 'Cache keys', link: '/guide/caching/keys' },
          ]
        },
        {
          text: 'Invalidation',
          collapsible: true,
          items: [
            { text: 'How invalidation works', link: '/guide/invalidation/' },
            { text: 'Purging manually', link: '/guide/invalidation/purging' },
          ]
        },
        {
          text: 'Providers',
          collapsible: true,
          items: [
            { text: 'Choosing a provider', link: '/guide/providers/' },
            { text: 'Memory', link: '/guide/providers/memory' },
            { text: 'Redis, KeyDB & Valkey', link: '/guide/providers/redis' },
            { text: 'Custom provider', link: '/guide/providers/custom' },
          ]
        },
        {
          text: 'Recipes',
          collapsible: true,
          items: [
            { text: 'Which recipe?', link: '/guide/recipes/' },
            { text: 'Public content API', link: '/guide/recipes/public-content' },
            { text: 'Authenticated responses', link: '/guide/recipes/authenticated' },
            { text: 'Several instances', link: '/guide/recipes/multi-instance' },
            { text: 'A few expensive routes', link: '/guide/recipes/expensive-routes' },
            { text: 'Locales & query-heavy APIs', link: '/guide/recipes/i18n-and-query' },
            { text: 'Previews & drafts', link: '/guide/recipes/previews-drafts' },
          ]
        },
        {
          text: 'Admin panel',
          items: [
            { text: 'Dashboard & controls', link: '/guide/admin/' },
          ]
        },
        {
          text: 'Reference',
          collapsible: true,
          items: [
            { text: 'Configuration', link: '/guide/reference/config' },
            { text: 'Services', link: '/guide/reference/services' },
            { text: 'Routes', link: '/guide/reference/routes' },
            { text: 'Types', link: '/guide/reference/types' },
          ]
        },
        {
          text: 'Troubleshooting',
          items: [
            { text: 'Common problems', link: '/guide/troubleshooting' },
          ]
        },
      ],
      '/4.x.x/': [
        {
          text: 'Guide',
          items: [
            { text: 'Introduction', link: '/4.x.x/' },
            { text: 'Installation', link: '/4.x.x/installation' },
          ]
        },
        {
          text: 'Provider',
          collapsible: true,
          items: [
            { text: 'Provider configuration', link: '/4.x.x/provider/' },
            { text: 'Provider: Memory', link: '/4.x.x/provider/memory' },
            { text: 'Provider: Redis', link: '/4.x.x/provider/redis' },
            { text: 'Provider: Couchbase', link: '/4.x.x/provider/couchbase' },
            { text: 'Custom provider', link: '/4.x.x/provider/custom-provider' },
          ]
        },
        {
          text: 'Strategy',
          collapsible: true,
          items: [
            { text: 'Strategy configuration', link: '/4.x.x/strategy/' },
            { text: 'Cache content type', link: '/4.x.x/strategy/cache-content-type' },
            { text: 'Cache custom routes', link: '/4.x.x/strategy/cache-custom-routes' },
            { text: 'Cache keys', link: '/4.x.x/strategy/cache-keys' },
            { text: 'Debug mode', link: '/4.x.x/strategy/debug' },
          ]
        },
        {
          text: 'API',
          collapsible: true,
          items: [
            { text: 'Services', link: '/4.x.x/api/' },
            { text: 'Admin Routes', link: '/4.x.x/api/admin-routes' },
          ]
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          collapsible: true,
          items: [
            { text: 'Configuration', link: '/reference/configuration' },
            { text: 'Routes', link: '/reference/routes' },
            { text: 'Services', link: '/reference/services' },
          ]
        }
      ]
    }
  }
}, __dirname));
