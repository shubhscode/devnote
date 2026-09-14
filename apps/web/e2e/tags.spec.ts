import { expect, test } from '@playwright/test';

// Tag management: sidebar hover actions rename a tag across notes + delete asks first.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

test('rename tag from sidebar updates list + filter', async ({ page }) => {
  // Seed note carries #meta. Hover reveals row actions.
  await page.getByTitle('Filter: tag:meta').hover();
  await page.getByTitle('Rename #meta').click();
  const input = page.getByPlaceholder('New tag name');
  await expect(input).toBeVisible();
  await input.fill('metal');
  await input.press('Enter');

  await expect(page.getByTitle('Filter: tag:metal', { exact: true })).toBeVisible();
  await expect(page.getByTitle('Filter: tag:meta', { exact: true })).toHaveCount(0);

  // Filter by the new name finds the note.
  await page.getByTitle('Filter: tag:metal', { exact: true }).click();
  await expect(page.getByPlaceholder('Filter notes…')).toHaveValue('tag:metal');

  // Persists across reload.
  await page.reload();
  await expect(page.getByTitle('Filter: tag:metal', { exact: true })).toBeVisible();
});

test('delete tag asks for confirm first', async ({ page }) => {
  await page.getByTitle('Filter: tag:plan').hover();
  await page.getByTitle('Delete #plan from all notes').click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Delete tag' }).click();
  await expect(page.getByTitle('Filter: tag:plan')).toHaveCount(0);
});
