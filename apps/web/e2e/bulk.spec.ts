import { expect, test } from '@playwright/test';

// Bulk organization: shift-range select, bulk tag/status, sort orders, notebook reorder.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

test('shift-range selects both, bulk tag + status apply', async ({ page }) => {
  const rows = page.locator('.note-row-in');
  await rows.first().click();
  await rows.last().click({ modifiers: ['Shift'] });
  await expect(page.getByText('2 selected')).toBeVisible();

  // Bulk tag.
  await page.getByRole('button', { name: '#Tag' }).click();
  const tagInput = page.getByPlaceholder('Add tag… (Enter)');
  await tagInput.fill('bulked');
  await tagInput.press('Enter');
  await expect(page.getByText('#bulked').first()).toBeVisible();

  // Bulk status.
  await page.getByTitle('Set status for selected').selectOption('active');
  await expect(page.locator('.note-row-in').getByText('Active').first()).toBeVisible();

  // Persists across reload.
  await page.reload();
  await expect(page.getByText('#bulked').first()).toBeVisible();
});

test('select-all + clear toggle, sort by title reorders', async ({ page }) => {
  await page.getByRole('button', { name: 'Select all' }).click();
  await expect(page.getByText('2 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByText('2 selected')).toHaveCount(0);

  // Default (updated): seed order Welcome first. Title: Roadmap first.
  await expect(page.locator('.note-row-in').first()).toContainText('Welcome');
  await page.getByTitle(/List order/).selectOption('title');
  await expect(page.locator('.note-row-in').first()).toContainText('Roadmap');

  // Persists across reload.
  await page.reload();
  await expect(page.locator('.note-row-in').first()).toContainText('Roadmap');
});

test('notebook move-down reorders siblings', async ({ page }) => {
  const nav = page.locator('nav');
  const before = await nav.innerText();
  expect(before.indexOf('Inbox')).toBeLessThan(before.indexOf('Projects'));

  await page.locator('nav').getByText('Inbox', { exact: true }).hover();
  await page.getByTitle('Move down among siblings').first().click();

  const after = await nav.innerText();
  expect(after.indexOf('Projects')).toBeLessThan(after.indexOf('Inbox'));
});

test('bulk move relocates notes via dialog', async ({ page }) => {
  await page.getByRole('button', { name: 'Select all' }).click();
  await page.getByRole('button', { name: /Move/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByText('Projects', { exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
