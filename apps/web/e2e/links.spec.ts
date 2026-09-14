import { expect, test } from '@playwright/test';

// 2.2 wikilinks: [[ autocomplete, preview click-to-open, broken flag, backlinks.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+n`);
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('');
});

test('[[ autocompletes note titles', async ({ page }) => {
  await page.locator('.cm-content').click();
  await page.keyboard.type('see [[road', { delay: 30 });
  await expect(page.locator('.cm-tooltip-autocomplete')).toBeVisible();
  await expect(page.locator('.cm-completionLabel').first()).toContainText('Roadmap');
  // CodeMirror ignores Enter within interactionDelay of the last keystroke.
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await expect(page.locator('.cm-content')).toContainText('[[Roadmap]]');
});

test('preview link click opens the target note', async ({ page }) => {
  await page.locator('.cm-content').click();
  await page.keyboard.type('see [[Roadmap]]', { delay: 10 });
  await page.getByTitle('Side by side (mod+P)').click();
  const link = page.locator('.markdown-body a.wikilink');
  await expect(link).toContainText('Roadmap');
  await expect(link).not.toHaveAttribute('data-broken', 'true');
  await link.click();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Roadmap');
});

test('broken links are flagged and report on click', async ({ page }) => {
  await page.locator('.cm-content').click();
  await page.keyboard.type('see [[Nope]]', { delay: 10 });
  await page.getByTitle('Side by side (mod+P)').click();
  const link = page.locator('.markdown-body a.wikilink');
  await expect(link).toHaveAttribute('data-broken', 'true');
  await link.click();
  await expect(page.getByText('No note titled "Nope"')).toBeVisible();
});

test('backlinks panel lists and opens linking notes', async ({ page }) => {
  await page.locator('.cm-content').click();
  await page.keyboard.type('hub ref [[Roadmap]]', { delay: 10 });
  // Open Roadmap from the list (untitled new note first, then Welcome, Roadmap).
  await page.locator('.note-row-in').nth(2).click();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Roadmap');
  await expect(page.getByRole('button', { name: /Linked from · 1/ })).toBeVisible();
  await page.getByRole('button', { name: /Linked from · 1/ }).click();
  await expect(page.getByRole('button', { name: /Untitled · 1/ })).toBeVisible();
  await page.getByRole('button', { name: /Untitled · 1/ }).click();
  await expect(page.locator('.cm-content')).toContainText('hub ref');
});
