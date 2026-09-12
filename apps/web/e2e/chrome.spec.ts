import { expect, test } from '@playwright/test';

// Window chrome: custom traffic lights render only inside Tauri.
// In a plain browser the sidebar starts with the view content (no lights).

test('no traffic lights in the browser', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
  await expect(page.getByTestId('traffic-lights')).toHaveCount(0);
  await expect(page.locator('aside').getByText('All Notes')).toBeVisible();
});
