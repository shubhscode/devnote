import { expect, test } from '@playwright/test';

// Templates: picker, apply with date title, tags, instruction stripping.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

test('apply daily report template to an empty note', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+n`);
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('');

  await page.getByText('Choose a template').click();
  const filter = page.getByPlaceholder(/Choose a template…/);
  await expect(filter).toBeVisible();
  await filter.fill('daily');
  await page.keyboard.press('Enter');

  await expect(page.getByPlaceholder('Untitled')).toHaveValue(/\d{4}-\d{2}-\d{2} - Daily Report/);
  await expect(page.locator('.cm-content')).toContainText('## Blockers');
  await expect(page.locator('.cm-content')).not.toContainText('!Instructions');
  await expect(page.getByRole('main').getByText('#report', { exact: true })).toBeVisible();
});
