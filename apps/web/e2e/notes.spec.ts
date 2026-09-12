import { expect, test } from '@playwright/test';

// Regression: switching notes must swap BOTH title and body (edit + preview).
// Seed data (fresh localStorage): 'Welcome to devnote' + 'Roadmap'.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

test('switching notes swaps editor content', async ({ page }) => {
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('Local-first notes');

  await page.getByText('Roadmap', { exact: true }).click();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Roadmap');
  await expect(editor).toContainText('PLAN.md');
  await expect(editor).not.toContainText('Local-first notes');

  await page.getByText('Welcome to devnote', { exact: true }).first().click();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
  await expect(editor).toContainText('Local-first notes');
});

test('switching notes swaps preview content', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+e`); // preview-only mode
  const preview = page.locator('.markdown-body');
  await expect(preview).toContainText('Local-first notes');

  await page.getByText('Roadmap', { exact: true }).click();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Roadmap');
  await expect(preview).toContainText('PLAN.md');
  await expect(preview).not.toContainText('Local-first notes');
});
