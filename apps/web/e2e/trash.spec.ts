import { expect, test } from '@playwright/test';

// Trash loop: trash the active note (hooks-crash regression), restore via the
// banner + Move-to-Notebook dialog, then delete forever via the in-app modal.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

test('trash active note, restore, delete forever', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Trash the active note from the editor menu — the app must stay alive.
  await page.getByTitle('More actions').click();
  await page.getByText('Move to trash', { exact: true }).click();
  await expect(page.getByText('No note selected')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Trash \d+$/ })).toBeVisible();
  expect(errors).toEqual([]);

  // Trash view lists it; restore it into Inbox.
  await page.getByRole('button', { name: /^Trash \d+$/ }).click();
  await page.getByText('Welcome to devnote', { exact: true }).click();
  await expect(page.getByText('This note is in Trash.')).toBeVisible();
  await page.getByText('Restore…', { exact: true }).click();
  await page.getByRole('dialog').getByText('Inbox', { exact: true }).click();
  await expect(page.getByText('This note is in Trash.')).toHaveCount(0);

  // Trash again, then delete forever through the in-app confirm (no native dialog).
  await page.getByTitle('More actions').click();
  await page.getByText('Move to trash', { exact: true }).click();
  await page.getByRole('button', { name: /^Trash \d+$/ }).click();
  await page.getByText('Welcome to devnote', { exact: true }).click();
  await page.getByText('Delete forever', { exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Delete forever' }).last().click();
  await expect(page.getByText('Welcome to devnote', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
