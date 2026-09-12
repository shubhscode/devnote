import { expect, test, type Page } from '@playwright/test';

// Telescope: source browser, command run, notebook jump.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

async function openTelescope(page: Page): Promise<void> {
  await page.getByTitle(/Telescope/).click();
  await expect(page.getByPlaceholder(/Type to search everything/)).toBeVisible();
}

test('browses sources and runs a command', async ({ page }) => {
  await openTelescope(page);
  for (const label of ['Commands', 'Notebooks', 'Tags', 'Contents', 'Themes']) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await page.getByPlaceholder(/Type to search everything/).fill('> new note');
  await page.keyboard.press('Enter');
  // A fresh empty note is active.
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('');
});

test('jumps to a notebook via the b source', async ({ page }) => {
  await openTelescope(page);
  await page.getByPlaceholder(/Type to search everything/).fill('b Projects');
  await page.keyboard.press('Enter');
  // Exit animation keeps the overlay mounted briefly — wait for the rows to
  // detach (the input placeholder swaps per scope, so it can't signal this).
  await expect(page.locator('#tsc-row-0')).toHaveCount(0);
  await expect(page.getByText('Projects / devnote')).toBeVisible();
});
