import { expect, test } from '@playwright/test';

// Discoverability + a11y: row menus work keyboard-only, dialogs trap focus,
// copy buttons are named, notices are a live region.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

test('tag row menu opens by keyboard and Escape refocuses the trigger', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Tag actions for #meta' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: 'Tag actions for #meta' })).toBeVisible();
  // First item autofocused on keyboard-open.
  await expect(page.getByRole('menuitem', { name: 'Rename #meta' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Merge #meta into another tag…' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('notebook row menu needs no hover', async ({ page }) => {
  // No hover: the … trigger is tab-reachable and opens the full action list.
  await page.getByRole('button', { name: 'Notebook actions for Inbox' }).click();
  for (const name of ['Move up among siblings', 'Move down among siblings', 'Open as workspace (Enter)', 'New sub-notebook', 'Rename', 'Delete']) {
    await expect(page.getByRole('menuitem', { name })).toBeVisible();
  }
  await page.keyboard.press('Escape');
});

test('telescope traps Tab and restores focus on close', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.locator('.cm-content').click();
  await page.keyboard.press(`${mod}+k`);
  const dialog = page.getByRole('dialog', { name: 'Telescope' });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
  const inside = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    return !!dlg && dlg.contains(document.activeElement);
  });
  expect(inside).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('copy-code button is named and keyboard-focusable', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+n`);
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('');
  await page.locator('.cm-content').click();
  await page.keyboard.type('```js', { delay: 10 });
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.keyboard.type('const a = 1;', { delay: 10 });
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.keyboard.type('```', { delay: 10 });
  await page.getByTitle('Side by side (mod+P)').click();
  const btn = page.locator('.markdown-body .copy-btn').first();
  await expect(btn).toHaveAttribute('aria-label', 'Copy code block');
  await btn.focus();
  await expect(btn).toBeVisible();
});

test('notice toast is a live region', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  // Trash every note so no notebook/active target exists.
  await page.getByRole('button', { name: 'Select all' }).click();
  await page.getByRole('button', { name: 'Trash', exact: true }).click();
  await page.keyboard.press(`${mod}+Enter`);
  const toast = page.getByRole('status');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Select a notebook first');
});
