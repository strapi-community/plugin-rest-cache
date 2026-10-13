import { test, expect, request, type Browser } from '@playwright/test';

const ARTICLES = '/admin/content-manager/collection-types/api::article.article';
const PURGE = 'Purge REST Cache';

/**
 * An admin granted "Purge cache" and content-manager read on articles, but not
 * "Read cache strategy configuration".
 *
 * The purge controls used to decide whether to render from GET
 * /rest-cache/config/strategy alone. That route needs cache.read-strategy, so
 * for this admin it answered 403, every control hid itself, and the one thing
 * their permission is for was nowhere in the panel.
 */
test.describe('purge permission without strategy access', () => {
  let email: string;
  const password = 'Password123';

  test.beforeAll(async ({ baseURL }) => {
    const api = await request.newContext({ baseURL, storageState: undefined });

    // The super admin created by global-setup.
    const login = await api.post('/admin/login', {
      data: { email: 'admin@strapi.io', password },
    });
    const token = (await login.json()).data.token as string;
    const auth = { Authorization: `Bearer ${token}` };

    const schema = await api.get('/content-type-builder/content-types/api::article.article', {
      headers: auth,
    });
    const fields = Object.keys((await schema.json()).data.schema.attributes);

    // Unique per run: the playground database persists between local runs.
    const suffix = Date.now();
    const role = await api.post('/admin/roles', {
      headers: auth,
      data: { name: `purge-only-${suffix}`, description: 'purge only' },
    });
    const roleId = (await role.json()).data.id as number;

    const permissions = await api.put(`/admin/roles/${roleId}/permissions`, {
      headers: auth,
      data: {
        permissions: [
          {
            action: 'plugin::content-manager.explorer.read',
            subject: 'api::article.article',
            properties: { fields },
            conditions: [],
          },
          {
            action: 'plugin::rest-cache.cache.purge',
            subject: null,
            properties: {},
            conditions: [],
          },
        ],
      },
    });
    expect(permissions.ok()).toBe(true);

    email = `purge-only-${suffix}@strapi.io`;
    const created = await api.post('/admin/users', {
      headers: auth,
      data: { firstname: 'purge', lastname: 'only', email, roles: [roleId] },
    });
    const { registrationToken } = (await created.json()).data;
    const registered = await api.post('/admin/register', {
      data: { registrationToken, userInfo: { firstname: 'purge', lastname: 'only', password } },
    });
    expect(registered.ok()).toBe(true);

    await api.dispose();
  });

  const logIn = async (browser: Browser, baseURL: string) => {
    // A fresh context: not the super admin's saved session.
    const context = await browser.newContext({ baseURL, storageState: undefined });
    const page = await context.newPage();

    await page.goto('/admin/auth/login');
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/admin', { timeout: 60_000 });

    return { context, page };
  };

  test('is offered the list-view purge, and it works', async ({ browser, baseURL }) => {
    const { context, page } = await logIn(browser, baseURL!);

    const strategy = page.waitForResponse((res) =>
      res.url().endsWith('/rest-cache/config/strategy')
    );
    await page.goto(ARTICLES);

    // The fix must not have been made by relaxing the strategy route.
    expect((await strategy).status()).toBe(403);

    const purge = page.getByRole('button', { name: PURGE }).first();
    await expect(purge).toBeVisible({ timeout: 10_000 });
    await purge.click();
    await page.getByRole('alertdialog').getByRole('button', { name: PURGE }).click();
    await expect(page.getByText('Cache purged successfully').first()).toBeVisible();

    await context.close();
  });

  test('is offered the edit-view purge action', async ({ browser, baseURL }) => {
    const { context, page } = await logIn(browser, baseURL!);

    const anonymous = await request.newContext({ baseURL, storageState: undefined });
    const { data } = (await (await anonymous.get('/api/articles')).json()) as {
      data: Array<{ documentId: string }>;
    };
    await anonymous.dispose();

    await page.goto(`${ARTICLES}/${data[0].documentId}`);

    await page
      .getByRole('button', { name: /more (document )?actions/i })
      .last()
      .click();
    await expect(page.getByRole('menuitem', { name: PURGE })).toBeVisible();

    await context.close();
  });
});
