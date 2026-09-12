import { expect, test } from '@playwright/test';

// Revisions: snapshot on note-switch, browse history, restore an older version.
// Restoring unsaved work keeps the pre-restore state (undoable restores).

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

test('snapshot on switch and restore older version', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+n`);
  await page.getByPlaceholder('Untitled').fill('RevTest');
  await page.locator('.cm-content').click();
  await page.keyboard.type('version one', { delay: 5 });

  // Switch away (snapshots v1) and back, then add unsaved v2.
  await page.getByText('Welcome to devnote', { exact: true }).first().click();
  await page.getByText('RevTest', { exact: true }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.type(' plus two', { delay: 5 });

  // History holds the v1 snapshot only.
  await page.getByTitle('More actions').click();
  await page.getByTitle('Revision history').click();
  await expect(page.getByText('History — RevTest')).toBeVisible();
  const items = page.locator('div.w-52 button');
  await expect(items).toHaveCount(1);

  // Restore v1: unsaved v2 is snapshotted first (undoable), so now two.
  await items.first().click();
  await page.getByText('Restore this revision').click();
  await expect(page.locator('.cm-content')).toContainText('version one');
  await expect(page.locator('.cm-content')).not.toContainText('plus two');
  await expect(page.locator('div.w-52 button')).toHaveCount(2);
});
