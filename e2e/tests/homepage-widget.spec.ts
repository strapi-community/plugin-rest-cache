import { test, expect } from '@playwright/test';

import { warmCache } from '../helpers';

test.describe('homepage widget', () => {
  test('reports what the cache holds', async ({ page, baseURL }) => {
    await warmCache(baseURL!);

    await page.goto('/admin');

    const widget = page
      .locator('div')
      .filter({ hasText: /^REST Cache/ })
      .first();

    await expect(widget).toBeVisible();

    // The count is pluralised through ICU, so this also proves the message
    // format and the translation file are wired up rather than falling back
    // to a raw message id.
    await expect(page.getByText(/\d+ (entry|entries) cached/)).toBeVisible();
    await expect(page.getByText(/via memory/)).toBeVisible();
  });

  test('links to the settings page', async ({ page, baseURL }) => {
    await page.goto('/admin');

    await page.getByRole('link', { name: 'Open REST Cache' }).click();

    await page.waitForURL('**/admin/settings/rest-cache');
    await expect(page.getByRole('heading', { name: 'REST Cache' })).toBeVisible();
  });
});
