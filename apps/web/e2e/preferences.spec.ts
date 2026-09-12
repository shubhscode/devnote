import { expect, test } from '@playwright/test';

// Preferences: theme switch persists; default notebook applies to new notes.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

test('theme switch persists across reload', async ({ page }) => {
  await page.getByTitle('Preferences (mod+,)').click();
  await expect(page.getByRole('heading', { name: 'Preferences' })).toBeVisible();
  await page.getByText('Appearance').click();
  // Theme rows now include "Solarized Dark" — match the exact name span.
  await page.getByText('Dark', { exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('default notebook applies to new notes', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.getByTitle('Preferences (mod+,)').click();
  await page.getByLabel('Default notebook').selectOption({ label: 'Projects / devnote' });
  await page.keyboard.press('Escape');
  await page.keyboard.press(`${mod}+n`);
  await expect(page.getByText('Projects / devnote').first()).toBeVisible();
});
