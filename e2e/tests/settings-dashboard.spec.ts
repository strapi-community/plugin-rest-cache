import { test, expect, type Page } from '@playwright/test';

import { warmCache } from '../helpers';

const DASHBOARD = '/admin/settings/rest-cache';

/** The row for a content type in the "Cached content types" table. */
const rowFor = (page: Page, uid: string) =>
  page.getByRole('row').filter({ hasText: uid });

test.describe('settings dashboard', () => {
  test('shows the cache overview', async ({ page, baseURL }) => {
    await warmCache(baseURL!);
    await page.goto(DASHBOARD);

    await expect(page.getByRole('heading', { name: 'REST Cache' })).toBeVisible();

    // The four headline figures. `.first()` because "Cached content types" is
    // also the heading of the table further down the page.
    for (const label of [
      'Cached entries',
      'Stored ETags',
      'Cached content types',
      'Provider',
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    // The provider name is read from the running server, so this also proves
    // the stats endpoint is reachable and shaped as the page expects.
    await expect(page.getByText('memory', { exact: true })).toBeVisible();
  });

  test('gives every stat card the same height', async ({ page, baseURL }) => {
    await page.goto(DASHBOARD);

    const labels = ['Cached entries', 'Stored ETags', 'Cached content types', 'Provider'];

    const heights = await Promise.all(
      labels.map(async (label) => {
        const card = page
          .getByText(label, { exact: true })
          .first()
          // The card Box is the nearest ancestor with a radius.
          .locator('xpath=ancestor::*[contains(@class,"sc-")][3]')
          .first();

        const box = await card.boundingBox();
        return box?.height ?? 0;
      })
    );

    // Only the provider card carries a hint line, and before it was given a
    // full-height box that made it taller than its three neighbours.
    expect(new Set(heights).size).toBe(1);
    expect(heights[0]).toBeGreaterThan(0);
  });

  test('reports the resolved routes for a cached content type', async ({ page, baseURL }) => {
    await page.goto(DASHBOARD);

    const row = rowFor(page, 'api::article.article');

    await expect(row).toBeVisible();
    await expect(row).toContainText('/api/articles');
    // maxAge is milliseconds in config; showing the raw number is how a
    // 1000x misconfiguration hides.
    await expect(row).toContainText('1h');
  });

  test('purging updates the counts without a reload', async ({ page, baseURL }) => {
    // Warm before loading the page: an earlier test may have purged, and this
    // test is about the transition from a non-zero count to zero.
    await warmCache(baseURL!);
    await page.goto(DASHBOARD);

    const row = rowFor(page, 'api::article.article');
    // `td`, not getByRole('cell'): the design system's Td renders a gridcell
    // role, so a cell lookup finds nothing.
    const entries = row.locator('td').nth(1);

    await expect(entries).not.toHaveText('0');

    await row.getByRole('button', { name: 'Purge' }).click();
    await page.getByRole('button', { name: 'Purge REST Cache' }).click();

    // The point of this assertion: nothing reloads the page. The mutation
    // invalidates the stats tag and the query re-runs on its own. Before, the
    // figures stayed stale until the admin navigated away and back.
    await expect(entries).toHaveText('0');
  });

  test('flags a content type that shares entries across callers', async ({ page, baseURL }) => {
    await page.goto(DASHBOARD);

    // api::category.category is configured with keys.useAuth, so its entries
    // are keyed per caller and it should say so.
    await expect(rowFor(page, 'api::category.category')).toContainText(
      'Keyed per caller'
    );
  });
});
