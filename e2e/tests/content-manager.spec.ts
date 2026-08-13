import { test, expect } from '@playwright/test';

import { openFirstArticle } from '../helpers';

const ARTICLES = '/admin/content-manager/collection-types/api::article.article';

test.describe('content-manager integration', () => {
  test('shows the cache panel on the edit view', async ({ page, baseURL }) => {
    await openFirstArticle(page, baseURL!);

    // The panel used to render an empty body under a hardcoded English title,
    // so assert on the sentence that makes it useful rather than the title.
    await expect(page.getByText(/cached for up to/i)).toBeVisible();
    await expect(page.getByText(/cached for up to 1h/i)).toBeVisible();
  });

  test('offers the purge action in the document actions menu', async ({ page, baseURL }) => {
    await openFirstArticle(page, baseURL!);

    // The entry-level menu, not the page-level one.
    await page
      .getByRole('button', { name: /more (document )?actions/i })
      .last()
      .click();

    await expect(
      page.getByRole('menuitem', { name: 'Purge REST Cache' })
    ).toBeVisible();
  });

  test('offers the purge button on the list view', async ({ page, baseURL }) => {
    await page.goto(ARTICLES);

    await expect(page.getByRole('button', { name: 'Purge REST Cache' })).toBeVisible();
  });

  test('leaves an uncached content type alone', async ({ page, baseURL }) => {
    // api::user is not in the configured strategy, so neither the panel nor
    // the action should appear. A contribution that renders unconditionally
    // would tell editors their content is cached when it is not.
    await page.goto('/admin/content-manager/collection-types/plugin::users-permissions.user');

    await expect(page.getByText(/cached for up to/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Purge REST Cache' })).toHaveCount(0);
  });
});
