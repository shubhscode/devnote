import { expect, test } from '@playwright/test';

// Adaptive panes: resizable sidebar/list with persisted widths, list
// collapse toggle, narrow auto-collapse, virtualized long lists.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

test('sidebar resizer adjusts width by keyboard and persists', async ({ page }) => {
  const sep = page.getByRole('separator', { name: 'Resize sidebar' });
  await expect(sep).toBeVisible();
  const aside = page.locator('aside');
  const before = await aside.evaluate((el) => el.getBoundingClientRect().width);
  await sep.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const after = await aside.evaluate((el) => el.getBoundingClientRect().width);
  expect(after).toBeGreaterThan(before);
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
  const persisted = await page.locator('aside').evaluate((el) => el.getBoundingClientRect().width);
  expect(persisted).toBe(after);
  // Double-click resets to the 240 default.
  await page.getByRole('separator', { name: 'Resize sidebar' }).dblclick();
  const reset = await page.locator('aside').evaluate((el) => el.getBoundingClientRect().width);
  expect(reset).toBe(240);
});

test('editor focus toggle hides sidebar and list, then restores both', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  const editor = page.locator('main');
  await expect(page.getByTestId('note-list-scroll')).toBeVisible();
  await expect(page.locator('aside')).toBeVisible();
  // Toggle lives top-left of the editor pane; no breadcrumb, no list-header button.
  await expect(editor.getByText('Inbox', { exact: true })).toHaveCount(0);
  await editor.getByRole('button', { name: 'Enter focus mode' }).click();
  await expect(page.getByTestId('note-list-scroll')).toHaveCount(0);
  await expect(page.locator('aside')).toHaveCount(0);
  await editor.getByRole('button', { name: 'Exit focus mode' }).click();
  await expect(page.getByTestId('note-list-scroll')).toBeVisible();
  await expect(page.locator('aside')).toBeVisible();
  // Keyboard toggle still works.
  await page.keyboard.press(`${mod}+Backslash`);
  await expect(page.getByTestId('note-list-scroll')).toHaveCount(0);
  await page.keyboard.press(`${mod}+Backslash`);
  await expect(page.getByTestId('note-list-scroll')).toBeVisible();
});

test('virtualized list renders a window of 500 notes', async ({ page }) => {
  // Seed through the live store: writing localStorage + reloading would be
  // clobbered by the pagehide flush of the old in-memory state.
  await page.evaluate(() => {
    const api = (window as unknown as { __devnoteStore: { getState: () => { notes: { id: string }[]; notebooks: { id: string }[] }; setState: (p: object) => void } }).__devnoteStore;
    const s = api.getState();
    const nb = s.notebooks[0]!.id;
    const t = new Date().toISOString();
    const notes = [...s.notes] as object[];
    for (let i = 0; i < 500; i++) {
      notes.push({
        id: `bulk-${i}`, title: `Bulk note ${String(i).padStart(3, '0')}`, body: 'body',
        notebookId: nb, tags: [], status: 'none', pinned: false, trashed: false,
        createdAt: t, updatedAt: t,
      });
    }
    api.setState({ notes });
  });
  await expect(page.getByText('502 notes')).toBeVisible();
  // Only the visible window is in the DOM — never all 500 rows.
  const rendered = await page.locator('.note-row-in').count();
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThan(500);
  // Newest-first: bulk notes head the list, seeds tail it.
  await expect(page.locator('.note-row-in').first()).toContainText('Bulk note');
  // Scrolling to the bottom materializes the tail (oldest seeds).
  await page.getByTestId('note-list-scroll').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(page.locator('.note-row-in').last()).toContainText(/Welcome|Roadmap/);
});

test('narrow window auto-hides the sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
  await expect(page.locator('aside')).toHaveCount(0);
  // Manual toggle still brings it back.
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+Slash`);
  await expect(page.locator('aside')).toBeVisible();
});
