import { expect, test } from '@playwright/test';

// Onboarding empties: no dead ends — every empty offers a next action.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

async function trashEverything(page) {
  await page.getByRole('button', { name: 'Select all' }).click();
  await page.getByRole('button', { name: 'Trash', exact: true }).click();
  await expect(page.getByText('// no notes yet')).toBeVisible();
}

test('empty list offers new, template, and telescope actions', async ({ page }) => {
  await trashEverything(page);
  const list = page.getByTestId('note-list-scroll');
  await list.getByRole('button', { name: /New note/ }).click();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('');
});

test('empty list From template opens the picker', async ({ page }) => {
  await trashEverything(page);
  await page.getByTestId('note-list-scroll').getByRole('button', { name: /From template/ }).click();
  await expect(page.getByRole('dialog', { name: 'Choose a template' })).toBeVisible();
});

test('no search results offer Clear search', async ({ page }) => {
  await page.getByPlaceholder('Filter notes…').fill('zzz-no-such-note');
  await expect(page.getByText('// no matches')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByPlaceholder('Filter notes…')).toHaveValue('');
  await expect(page.locator('.note-row-in')).toHaveCount(2);
});

test('empty editor offers template and telescope entries', async ({ page }) => {
  await trashEverything(page);
  await expect(page.getByText('// nothing open')).toBeVisible();
  const editor = page.getByRole('main');
  await editor.getByRole('button', { name: 'Find anything' }).click();
  await expect(page.getByRole('dialog', { name: 'Telescope' })).toBeVisible();
  await page.keyboard.press('Escape');
  await editor.getByRole('button', { name: 'From template' }).click();
  await expect(page.getByRole('dialog', { name: 'Choose a template' })).toBeVisible();
});
