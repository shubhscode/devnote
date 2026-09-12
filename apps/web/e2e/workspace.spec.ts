import { expect, test } from '@playwright/test';

// Workspace view: focus a notebook to scope the sidebar, exit to restore.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

test('focus notebook scopes sidebar, exit restores', async ({ page }) => {
  const sidebar = page.locator('aside');
  await sidebar.getByText('Projects', { exact: true }).click();
  await page.keyboard.press('Enter');

  await expect(sidebar.getByText(/Workspace/)).toBeVisible();
  await expect(sidebar.getByText('Inbox', { exact: true })).toHaveCount(0);
  // Tags scoped to the workspace subtree: plan stays, meta is gone.
  await expect(sidebar.getByText('plan', { exact: true })).toBeVisible();
  await expect(sidebar.getByText('meta', { exact: true })).toHaveCount(0);

  await sidebar.getByTitle('Exit workspace (show all)').click();
  await expect(sidebar.getByText('Inbox', { exact: true })).toBeVisible();
  await expect(sidebar.getByText('meta', { exact: true })).toBeVisible();
});

test('telescope mod+enter focuses workspace', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.getByTitle(/Telescope/).click();
  await page.getByPlaceholder(/Type to search everything/).fill('b Projects');
  await page.keyboard.press(`${mod}+Enter`);
  await expect(page.locator('aside').getByText(/Workspace/)).toBeVisible();
});

test('mod+enter toggles workspace for the selected notebook', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  const sidebar = page.locator('aside');
  await sidebar.getByText('Projects', { exact: true }).click();
  await page.keyboard.press(`${mod}+Enter`);
  await expect(sidebar.getByText(/Workspace/)).toBeVisible();
  await expect(sidebar.getByText('Inbox', { exact: true })).toHaveCount(0);
  await page.keyboard.press(`${mod}+Enter`);
  await expect(sidebar.getByText(/Workspace/)).toHaveCount(0);
  await expect(sidebar.getByText('Inbox', { exact: true })).toBeVisible();
});
