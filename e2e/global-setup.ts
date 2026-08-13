import { chromium, request, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The repository root is `"type": "module"`, so there is no __dirname here.
const HERE = dirname(fileURLToPath(import.meta.url));

const ADMIN = {
  email: 'admin@strapi.io',
  firstname: 'admin',
  lastname: 'admin',
  password: 'Password123',
};

const AUTH_STATE = resolve(HERE, '.auth/admin.json');

/**
 * Create the first admin, log in once, and save the session.
 *
 * Every spec reuses the saved state rather than logging in again: the login
 * form is Strapi's, not ours, and re-driving it per test buys nothing but
 * runtime.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;

  const api = await request.newContext({ baseURL });

  // Idempotent: the playground database persists between runs locally, so on
  // the second run the admin already exists and this returns 400.
  await api.post('/admin/register-admin', { data: ADMIN }).catch(() => undefined);

  // Give the dashboard something to show. Without this the cache is empty and
  // every count is zero, which is indistinguishable from the stats endpoint
  // being broken.
  for (const route of ['/api/articles', '/api/homepage', '/api/global']) {
    await api.get(route).catch(() => undefined);
  }

  await api.dispose();

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });

  await page.goto('/admin/auth/login');
  // By name rather than by label: the password field sits next to a "Show
  // password" toggle, so an accessible-name lookup for "Password" is
  // ambiguous.
  await page.locator('input[name="email"]').fill(ADMIN.email);
  await page.locator('input[name="password"]').fill(ADMIN.password);
  await page.locator('button[type="submit"]').click();

  // Landing on the homepage is what proves the credentials took.
  await page.waitForURL('**/admin', { timeout: 60_000 });

  mkdirSync(dirname(AUTH_STATE), { recursive: true });
  await page.context().storageState({ path: AUTH_STATE });

  await browser.close();
}
