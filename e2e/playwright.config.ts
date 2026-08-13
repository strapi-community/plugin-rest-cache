import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// testDir and globalSetup are resolved against this file, but `use.storageState`
// is resolved against the working directory - so it has to be absolute, or the
// suite only runs when invoked from e2e/.
const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Browser coverage for the admin panel.
 *
 * The jest suites under shared/tests boot Strapi in-process and exercise the
 * HTTP API. They cannot see the admin panel at all, which is how the panel
 * came to be broken for the whole Strapi 5 line without a single red build:
 * it declared react-router v5 routes against v6, registered no route to its
 * own page, and shipped an empty translation file. Every one of those is
 * invisible to a test that never renders anything.
 *
 * These tests boot the memory playground for real, build its admin, and drive
 * it in a browser.
 */

const PORT = Number(process.env.E2E_PORT ?? 1337);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests',
  outputDir: './.output',

  // The admin panel is a single shared instance with one seeded database, and
  // the tests purge and warm the cache. Running them in parallel would have
  // them clearing each other's entries.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  globalSetup: './global-setup.ts',

  use: {
    baseURL: BASE_URL,
    // Written by global-setup after logging in once.
    storageState: resolve(HERE, '.auth/admin.json'),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // `build` then `start`, not `develop`: develop compiles the admin lazily on
    // first request, so the first test races the bundler. This also exercises
    // the production admin build, which is what users actually run.
    command: 'pnpm --filter @strapi-plugin-rest-cache/playground-memory run e2e:serve',
    url: `${BASE_URL}/admin`,
    reuseExistingServer: !process.env.CI,
    // A cold admin build is slow, and slower again on a CI runner.
    timeout: 15 * 60 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
