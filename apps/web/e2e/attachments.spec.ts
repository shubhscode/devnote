import { expect, test } from '@playwright/test';

// Attachments need the desktop app (native byte transport). In browsers the
// paste is intercepted and answered with an honest notice — never silent.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

test('pasting an image in a browser explains attachments need the desktop app', async ({ page }) => {
  await page.evaluate(() => {
    const el = document.querySelector('.cm-content');
    if (!el) throw new Error('no editor');
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'snap.png', { type: 'image/png' }));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.getByText('File mirror needs the DevNote desktop app')).toBeVisible();
  // Placeholder was cleaned up — the failed upload leaves no residue.
  await expect(page.locator('.cm-content')).not.toContainText('Uploading');
});
