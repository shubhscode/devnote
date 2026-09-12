import { expect, test } from '@playwright/test';

// Slash commands insert blocks; the bubble menu formats selections.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+n`);
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('');
});

test('slash inserts a task list', async ({ page }) => {
  await page.locator('.cm-content').click();
  await page.keyboard.type('/task', { delay: 40 });
  await expect(page.locator('.cm-tooltip-autocomplete')).toBeVisible();
  await expect(page.locator('.cm-completionLabel').first()).toContainText('Task list');
  // CodeMirror ignores Enter within interactionDelay of the last keystroke.
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await expect(page.locator('.cm-content')).toContainText('- [ ]');
});

test('bubble menu bolds the selection', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.locator('.cm-content').click();
  await page.keyboard.type('hello world', { delay: 10 });
  await page.keyboard.press(`${mod}+a`);
  await expect(page.getByTestId('bubble-menu')).toBeVisible();
  await page.getByTitle('Bold (mod+B)').click();
  await expect(page.locator('.cm-content')).toContainText('**hello world**');
});

test('table enter continues rows, tab advances cells', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.locator('.cm-content').click();
  await page.keyboard.type('| a | b |', { delay: 10 });
  await page.keyboard.press('Enter');
  await page.keyboard.type('|---|---|', { delay: 10 });
  await page.keyboard.press('Enter');
  // New empty row appended after the delimiter.
  await expect(page.locator('.cm-content')).toContainText('|   |   |');
  // Tab from the first cell jumps to the second; typing lands there.
  await page.keyboard.type('x', { delay: 10 });
  await page.keyboard.press('Tab');
  await page.keyboard.type('y', { delay: 10 });
  await expect(page.locator('.cm-content')).toContainText('| y');
  // Preview renders a real table.
  await page.keyboard.press(`${mod}+e`);
  await expect(page.locator('.markdown-body table')).toBeVisible();
});
