import { expect, test } from '@playwright/test';

// Status UI: header dropdown changes status, pill appears in the note list.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

test('header dropdown sets status with list pill', async ({ page }) => {
  await page.getByTitle('Status: No status').click();
  await page.getByRole('main').getByText('On hold', { exact: true }).click();

  await expect(page.getByTitle('Status: On hold')).toBeVisible();
  await expect(page.locator('section').getByText('On hold', { exact: true }).first()).toBeVisible();

  // Persists across reload.
  await page.reload();
  await expect(page.getByTitle('Status: On hold')).toBeVisible();
});
