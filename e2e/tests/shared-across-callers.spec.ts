import { test, expect, type Page } from '@playwright/test';

const DASHBOARD = '/admin/settings/rest-cache';
const BADGE = 'Shared across callers';

const rowFor = (page: Page, uid: string) => page.getByRole('row').filter({ hasText: uid });

/** The badge's tooltip text for a row: what an admin reads to act on it. */
async function tooltipFor(page: Page, uid: string) {
  await rowFor(page, uid).getByText(BADGE).hover();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();

  return tooltip;
}

interface StatsRow {
  uid: string;
  hitpass: boolean;
  keysAuthIdentity: boolean;
  unkeyedAuthenticatedRoutes?: string[];
}

/**
 * Serve the real stats with some rows rewritten.
 *
 * The playground's strategy has no route that shares authenticated entries -
 * every spec on this server relies on that - so the cases are staged in the
 * response rather than in the configuration. The jest spec
 * auth-risk-flag-consistency covers the server producing these values from a
 * real strategy; this covers the dashboard reading them.
 */
async function stubStats(page: Page, rewrite: (row: StatsRow) => StatsRow) {
  await page.route('**/rest-cache/stats', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { contentTypes: StatsRow[] };

    body.contentTypes = body.contentTypes.map(rewrite);
    await route.fulfill({ response, json: body });
  });
}

test.describe('"Shared across callers" badge', () => {
  /**
   * The content type keeps the default hitpass, but a listed route caches
   * authenticated responses unkeyed. The server warns about it at boot.
   */
  test('flags a content type for a route that shares authenticated entries', async ({
    page,
  }) => {
    await stubStats(page, (row) =>
      row.uid === 'api::writer.editor'
        ? {
            ...row,
            hitpass: true,
            keysAuthIdentity: false,
            unkeyedAuthenticatedRoutes: ['/api/editors/:id'],
          }
        : row
    );

    await page.goto(DASHBOARD);

    await expect(rowFor(page, 'api::writer.editor')).toContainText(BADGE);

    // This content type's own hitpass is enabled, so "Hitpass is disabled"
    // would send the admin to a setting that is already right. The tooltip
    // has to name the route that is actually at fault.
    const tooltip = await tooltipFor(page, 'api::writer.editor');
    await expect(tooltip).toContainText('Route /api/editors/:id caches authenticated requests');
    await expect(tooltip).toContainText('keys.useAuth');
    await expect(tooltip).not.toContainText('Hitpass is disabled');
  });

  /**
   * hitpass: false on the content type, but every route keeps the strategy's
   * bypass, so nothing authenticated is cached. The server does not warn.
   */
  test('does not flag a content type whose routes all keep the bypass', async ({ page }) => {
    await stubStats(page, (row) =>
      row.uid === 'api::page.page'
        ? { ...row, hitpass: false, keysAuthIdentity: false, unkeyedAuthenticatedRoutes: [] }
        : row
    );

    await page.goto(DASHBOARD);

    // Rendered at all, so the negative below is not vacuous.
    await expect(rowFor(page, 'api::page.page')).toContainText('/api/pages');
    await expect(rowFor(page, 'api::page.page')).not.toContainText(BADGE);
  });

  test('falls back to the content type settings when the list is absent', async ({ page }) => {
    await stubStats(page, (row) => {
      const { unkeyedAuthenticatedRoutes: _omitted, ...rest } = row;

      if (row.uid === 'api::page.page') {
        return { ...rest, hitpass: false, keysAuthIdentity: false };
      }

      return rest;
    });

    await page.goto(DASHBOARD);

    await expect(rowFor(page, 'api::page.page')).toContainText(BADGE);
    await expect(rowFor(page, 'api::article.article')).not.toContainText(BADGE);

    // Without the list, the badge was raised from the content type's own
    // settings, which this sentence describes exactly.
    const tooltip = await tooltipFor(page, 'api::page.page');
    await expect(tooltip).toContainText('Hitpass is disabled but keys.useAuth is not set');
  });
});
