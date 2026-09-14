import { expect, test } from '@playwright/test';

// Tag management: sidebar row menus rename a tag across notes + delete asks first.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

test('rename tag from sidebar updates list + filter', async ({ page }) => {
  // Seed note carries #meta. Row actions live behind the … menu (no hover needed).
  await page.getByRole('button', { name: 'Tag actions for #meta' }).click();
  await page.getByRole('menuitem', { name: 'Rename #meta' }).click();
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
  await page.getByRole('button', { name: 'Tag actions for #plan' }).click();
  await page.getByRole('menuitem', { name: 'Delete #plan from all notes' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Delete tag' }).click();
  await expect(page.getByTitle('Filter: tag:plan')).toHaveCount(0);
});

test('tag input suggests existing tags, keyboard-accepts, and offers create', async ({ page }) => {
  // Welcome carries #meta, so #plan is the live suggestion.
  const input = page.getByPlaceholder('+ tag');
  await input.click();
  await expect(page.getByRole('listbox', { name: 'Tag suggestions' })).toBeVisible();
  await input.fill('pl');
  await expect(page.getByRole('option', { name: '#plan 1' })).toBeVisible();
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page.getByText('#plan', { exact: true }).first()).toBeVisible();

  // Unknown text offers an explicit create row (no silent datalist guess).
  await input.fill('bravo');
  await expect(page.getByRole('option', { name: 'Create #bravo' })).toBeVisible();
  await input.press('Enter');
  await expect(page.getByText('#bravo', { exact: true }).first()).toBeVisible();

  // Persists across reload.
  await page.reload();
  await expect(page.getByText('#plan', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('#bravo', { exact: true }).first()).toBeVisible();
});

test('Escape closes the tag suggestions without adding', async ({ page }) => {
  const input = page.getByPlaceholder('+ tag');
  await input.click();
  await expect(page.getByRole('listbox', { name: 'Tag suggestions' })).toBeVisible();
  await input.press('Escape');
  await expect(page.getByRole('listbox', { name: 'Tag suggestions' })).toHaveCount(0);
});
