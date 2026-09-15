import { expect, test } from '@playwright/test';

// Preferences: theme switch persists; default notebook applies to new notes.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

test('theme switch persists across reload', async ({ page }) => {
  await page.getByTitle('Preferences (mod+,)').click();
  await expect(page.getByRole('heading', { name: 'Preferences' })).toBeVisible();
  await page.getByText('Appearance').click();
  // Theme rows now include "Solarized Dark" — match the exact name span.
  await page.getByText('Dark', { exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('default notebook applies to new notes', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.getByTitle('Preferences (mod+,)').click();
  await page.getByLabel('Default notebook').selectOption({ label: 'Projects / devnote' });
  await page.keyboard.press('Escape');
  await page.keyboard.press(`${mod}+n`);
  // The new note lands in Projects / devnote (checked via the store —
  // the editor header no longer shows the notebook path).
  const path = await page.evaluate(() => {
    const api = (window as unknown as {
      __devnoteStore: {
        getState: () => {
          notes: { id: string; notebookId: string }[];
          notebooks: { id: string; name: string; parentId: string | null }[];
          activeNoteId: string | null;
        };
      };
    }).__devnoteStore.getState();
    const note = api.notes.find((n) => n.id === api.activeNoteId);
    const parts: string[] = [];
    let cur = api.notebooks.find((b) => b.id === note?.notebookId);
    while (cur) {
      parts.unshift(cur.name);
      cur = api.notebooks.find((b) => b.id === cur!.parentId);
    }
    return parts.join(' / ');
  });
  expect(path).toBe('Projects / devnote');
});

test('shortcut filter narrows the list', async ({ page }) => {
  await page.getByTitle('Preferences (mod+,)').click();
  await page.getByText('Shortcuts').click();
  await expect(page.getByText('26 of 26 commands')).toBeVisible();
  await page.getByLabel('Filter shortcuts').fill('trash');
  await expect(page.getByText('1 of 26 commands')).toBeVisible();
  await expect(page.getByText('No shortcuts match')).toHaveCount(0);
  await page.getByLabel('Filter shortcuts').fill('zzz-nope');
  await expect(page.getByText('No shortcuts match')).toBeVisible();
});

test('note-list sort default applies and persists', async ({ page }) => {
  await page.getByTitle('Preferences (mod+,)').click();
  await page.getByText('Editing').click();
  await page.getByText('Title A–Z').click();
  await page.keyboard.press('Escape');
  // Title order: Roadmap before Welcome.
  await expect(page.locator('.note-row-in').first()).toContainText('Roadmap');
  await page.reload();
  // Still title-sorted after reload.
  await expect(page.locator('.note-row-in').first()).toContainText('Roadmap');
});

test('sync tab validates the remote URL', async ({ page }) => {
  await page.getByTitle('Preferences (mod+,)').click();
  await page.getByText('Sync', { exact: true }).click();
  await expect(page.getByText('Markdown file mirror')).toBeVisible();
  const input = page.getByLabel('Sync remote URL');
  await input.fill('not a remote');
  await expect(page.getByText('Not a git remote')).toBeVisible();
  await input.fill('git@github.com:user/devnote.git');
  await expect(page.getByText('Not a git remote')).toHaveCount(0);
});
