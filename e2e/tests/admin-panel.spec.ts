import { test, expect } from '@playwright/test';

/**
 * The panel mounts at all.
 *
 * This is the cheapest and most valuable assertion in the suite. A plugin's
 * `register` runs inside the admin's own bootstrap, so anything that throws
 * there does not degrade to "my plugin is missing" - it aborts the render and
 * leaves an empty #strapi div with no console error.
 *
 * That is not hypothetical: `Widgets.checkWidgets` asserts `widget.icon` with
 * `invariant` even though `WidgetArgs` types it optional, so registering a
 * widget without an icon took down the entire administration panel. Every HTTP
 * test still passed, because the server was fine.
 */
test.describe('admin panel', () => {
  test('renders with the plugin registered', async ({ page }) => {
    await page.goto('/admin');

    // React actually mounted, rather than serving the shell and dying.
    await expect(page.locator('#strapi')).not.toBeEmpty();
    await expect(page.getByRole('heading', { name: /hello/i })).toBeVisible();
  });

  test('lists the plugin in the settings navigation', async ({ page }) => {
    await page.goto('/admin/settings');

    const nav = page.getByRole('navigation', { name: 'Settings' });
    await expect(nav.getByText('REST Cache', { exact: true })).toBeVisible();
  });
});
