import { createRequire } from 'module'
import defineVersionedConfig from 'vitepress-versioning-plugin-patched'

const require = createRequire(import.meta.url)
const pkg = require('@strapi-community/plugin-rest-cache/package.json')

export default defineVersionedConfig({
  title: "REST Cache",
  description: "Speed-up HTTP requests with LRU cache",
  base: "/plugin-rest-cache/",
  lastUpdated: true,
  versioning: {
    latestVersion: pkg.version,
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
            { text: 'Installation', link: '/guide/installation' },
          ]
        },
        {
          text: 'Provider',
          collapsible: true,
          items: [
            { text: 'Provider configuration', link: '/guide/provider/' },
            { text: 'Provider: Memory', link: '/guide/provider/memory' },
            { text: 'Provider: Redis', link: '/guide/provider/redis' },
            { text: 'Custom provider', link: '/guide/provider/custom-provider' },
          ]
        },
        {
          text: 'Strategy',
          collapsible: true,
          items: [
            { text: 'Strategy configuration', link: '/guide/strategy/' },
            { text: 'Cache content type', link: '/guide/strategy/cache-content-type' },
            { text: 'Cache custom routes', link: '/guide/strategy/cache-custom-routes' },
            { text: 'Cache keys', link: '/guide/strategy/cache-keys' },
            { text: 'Debug mode', link: '/guide/strategy/debug' },
          ]
        },
        {
          text: 'API',
          collapsible: true,
          items: [
            { text: 'Services', link: '/guide/api/' },
            { text: 'Admin Routes', link: '/guide/api/admin-routes' },
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
}, __dirname);
