import { expect, test } from '@playwright/test';

// Regression: mod+Shift+D must toggle distraction-free, not duplicate.
// (The mod+D handler once matched Shift+D first — e.key is 'D' with Shift.)
// Seed data (fresh localStorage): 'Welcome to devnote' + 'Roadmap'.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

test('mod+Shift+D toggles distraction-free without duplicating', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  const sidebar = page.locator('aside');
  await expect(sidebar).toBeVisible();
  await expect(page.getByText('Welcome to devnote', { exact: true })).toHaveCount(1);

  await page.keyboard.press(`${mod}+Shift+D`);
  await expect(sidebar).toHaveCount(0);

  await page.keyboard.press(`${mod}+Shift+D`);
  await expect(sidebar).toBeVisible();
  // No copy created by either chord.
  await expect(page.getByText('Welcome to devnote', { exact: true })).toHaveCount(1);
});

test('mod+D still duplicates', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  // Blur the editor so the window handler (not CodeMirror) owns the chord.
  await page.getByRole('button', { name: 'All Notes' }).click();
  await page.keyboard.press(`${mod}+d`);
  await expect(page.getByText('Welcome to devnote', { exact: true })).toHaveCount(2);
});
