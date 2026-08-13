import { request, type Page } from '@playwright/test';

/**
 * Warm the cache through the public API.
 *
 * Deliberately NOT `page.request`: that shares the browser context, so it
 * sends the admin session cookie - and the plugin's default hitpass bypasses
 * the cache for any request carrying an authorization or cookie header. The
 * requests would succeed, cache nothing, and leave every count at zero.
 */
export async function warmCache(baseURL: string) {
  const anonymous = await request.newContext({ baseURL, storageState: undefined });

  for (const route of ['/api/articles', '/api/homepage', '/api/global']) {
    await anonymous.get(route);
  }

  await anonymous.dispose();
}

/**
 * Open an existing article's edit view.
 *
 * Resolves the documentId over the API and navigates straight there rather
 * than clicking a row in the list: the list's action bar overlays the row
 * links, so the click is intercepted and times out.
 */
export async function openFirstArticle(page: Page, baseURL: string) {
  const anonymous = await request.newContext({ baseURL, storageState: undefined });
  const response = await anonymous.get('/api/articles');
  const body = (await response.json()) as { data: Array<{ documentId: string }> };
  await anonymous.dispose();

  const [article] = body.data;

  if (!article) {
    throw new Error('The playground has no articles to open.');
  }

  await page.goto(
    `/admin/content-manager/collection-types/api::article.article/${article.documentId}`
  );
}
