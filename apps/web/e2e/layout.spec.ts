import { expect, test } from '@playwright/test';

// Editor header layout: labeled segmented mode control + bubble overflow.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

test('segmented view control switches modes with labels', async ({ page }) => {
  const group = page.getByRole('radiogroup', { name: 'View mode' });
  await expect(group.getByRole('radio', { name: /Edit/ })).toHaveAttribute('aria-checked', 'true');
  await group.getByRole('radio', { name: /Preview/ }).click();
  await expect(group.getByRole('radio', { name: /Preview/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.markdown-body')).toBeVisible();
  await expect(page.locator('.cm-content')).toHaveCount(0);
  await group.getByRole('radio', { name: /Split/ }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.locator('.markdown-body')).toBeVisible();
});

test('bubble overflow applies block transforms', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+n`);
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('');
  await page.locator('.cm-content').click();
  await page.keyboard.type('hello world', { delay: 10 });
  await page.keyboard.press(`${mod}+a`);
  await expect(page.getByTestId('bubble-menu')).toBeVisible();
  // Primary actions stay one click; the rest live behind More formatting.
  await expect(page.getByTestId('bubble-menu').getByTitle('Bold (mod+B)')).toBeVisible();
  await page.getByTestId('bubble-menu').getByRole('button', { name: 'More formatting' }).click();
  await page.getByRole('menuitem', { name: 'Quote' }).click();
  await expect(page.locator('.cm-content')).toContainText('> hello world');
});
