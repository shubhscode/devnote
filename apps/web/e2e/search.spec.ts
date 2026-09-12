import { expect, test } from '@playwright/test';

// Search grammar: qualifiers, exclusions hint, match highlights.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

test('tag: qualifier filters and highlights', async ({ page }) => {
  await page.locator('#note-search').fill('tag:plan');
  await expect(page.getByText('Roadmap', { exact: true })).toBeVisible();
  await expect(page.getByText('Welcome to devnote', { exact: true })).toHaveCount(0);
  await page.getByText('Roadmap', { exact: true }).click();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Roadmap');
});

test('exclusions-only shows the hint and matches nothing', async ({ page }) => {
  await page.locator('#note-search').fill('-tag:meta');
  await expect(page.getByText(/Exclusions need a search term/)).toBeVisible();
  await page.locator('#note-search').fill('');
  await expect(page.getByText('Welcome to devnote', { exact: true })).toBeVisible();
});

test('bare text highlights matches in the list', async ({ page }) => {
  await page.locator('#note-search').fill('Welcome');
  await expect(page.locator('mark').first()).toContainText('Welcome');
});
