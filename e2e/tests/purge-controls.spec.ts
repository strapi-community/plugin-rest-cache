import { test, expect, request, type Page } from '@playwright/test';

const ARTICLES = '/admin/content-manager/collection-types/api::article.article';
const PURGE = 'Purge REST Cache';

/**
 * Strapi's guided tour overlays the page for a fresh admin and swallows
 * clicks. It is Strapi's, not ours, so get it out of the way and move on.
 */
async function skipGuidedTour(page: Page) {
  const skip = page.getByRole('dialog').getByRole('button', { name: 'Skip' });

  try {
    await skip.waitFor({ state: 'visible', timeout: 8_000 });
    await skip.click();
    await skip.waitFor({ state: 'hidden' });
  } catch {
    // No tour.
  }
}

test.describe('purge controls', () => {
  /**
   * The confirm button's loading state was set when a purge started and never
   * cleared, so the second time the dialog opened its only action was a
   * disabled spinner - until a page reload remounted the button.
   */
  test('the list-view purge can be used twice without a reload', async ({ page }) => {
    await page.goto(ARTICLES);
    await skipGuidedTour(page);

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await page.getByRole('button', { name: PURGE }).first().click();

      const confirm = page.getByRole('alertdialog').getByRole('button', { name: PURGE });
      await expect(confirm, `confirm button on attempt ${attempt}`).toBeEnabled({
        timeout: 5_000,
      });
      await confirm.click();

      await expect(page.getByText('Cache purged successfully').first()).toBeVisible();
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
    }
  });

  /**
   * The edit view's purge action must remove the cached response for the
   * entry that is open: /api/articles/:id, where REST's `:id` is the
   * documentId. It used to send the document's own fields as the route
   * params, so `:id` was filled with the numeric database row id and matched
   * no cache key.
   *
   * clearRelatedCache - on in the playground - masks that: a content type is a
   * member of its own related set, so every purge also wildcards its own
   * routes and the entry goes anyway. That is why the request body is asserted
   * directly, rather than relying on the entry going missing. Run with
   * CLEAR_RELATED_CACHE=false and the MISS assertion below covers it as well.
   */
  test('the edit-view purge action purges the open entry', async ({ page, baseURL }) => {
    // Cookie-less, so the default hitpass does not bypass the cache.
    const anonymous = await request.newContext({ baseURL, storageState: undefined });

    const list = await anonymous.get('/api/articles');
    const { data } = (await list.json()) as { data: Array<{ documentId: string }> };
    const { documentId } = data[0];
    const entryUrl = `/api/articles/${documentId}`;

    await anonymous.get(entryUrl);
    expect((await anonymous.get(entryUrl)).headers()['x-cache']).toBe('HIT');

    await page.goto(`${ARTICLES}/${documentId}`);

    const purgeRequest = page.waitForRequest(
      (req) => req.url().endsWith('/rest-cache/purge') && req.method() === 'POST'
    );

    await page
      .getByRole('button', { name: /more (document )?actions/i })
      .last()
      .click();
    await page.getByRole('menuitem', { name: PURGE }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /confirm/i }).click();

    const sent = (await purgeRequest).postDataJSON() as {
      contentType: string;
      params?: Record<string, unknown>;
    };

    await expect(page.getByText('Cache purged successfully')).toBeVisible();

    // The entry the editor purged must now be a miss.
    expect((await anonymous.get(entryUrl)).headers()['x-cache']).toBe('MISS');

    // And for the right reason: scoped to this entry's documentId.
    expect(sent.contentType).toBe('api::article.article');
    expect(sent.params?.id).toBe(documentId);

    await anonymous.dispose();
  });
});
