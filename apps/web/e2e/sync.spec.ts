import { expect, test } from '@playwright/test';

// Sync UI wiring (real git flows stay manual — desktop only).

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
});

test('conflict banner links the preserved loser note', async ({ page }) => {
  await page.evaluate(() => {
    const api = (window as unknown as {
      __devnoteStore: {
        getState: () => { notes: object[]; notebooks: { id: string }[] };
        setState: (p: object) => void;
      };
    }).__devnoteStore;
    const s = api.getState();
    const t = new Date().toISOString();
    const loser = {
      id: 'loser-1', title: 'Roadmap (conflict laptop)', body: 'loser text',
      notebookId: s.notebooks[0]!.id, tags: [], status: 'none',
      pinned: false, trashed: false, createdAt: t, updatedAt: t,
    };
    api.setState({ notes: [...s.notes, loser], syncState: 'conflict', conflictNoteIds: ['loser-1'] });
  });
  await expect(page.getByText('Sync conflict')).toBeVisible();
  await page.getByRole('button', { name: /Review loser/ }).click();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Roadmap (conflict laptop)');
});

test('restore stays disabled with an honest reason in browsers', async ({ page }) => {
  await page.getByTitle('Preferences (mod+,)').click();
  await page.getByText('Sync', { exact: true }).click();
  const btn = page.getByRole('button', { name: 'Restore from backup' });
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveAttribute('title', /desktop app/);
});
