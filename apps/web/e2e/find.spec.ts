import { expect, test } from '@playwright/test';

// 2.5 find/replace + lint + paste handling.

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('Welcome to devnote');
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+n`);
  await expect(page.getByPlaceholder('Untitled')).toHaveValue('');
});

async function typeLines(page, lines: string[]) {
  await page.locator('.cm-content').click();
  for (const [i, line] of lines.entries()) {
    if (i > 0) {
      await page.waitForTimeout(300);
      await page.keyboard.press('Enter');
    }
    await page.keyboard.type(line, { delay: 10 });
  }
}

test('mod+F opens the find panel and highlights matches', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await typeLines(page, ['hello world, hello again']);
  await page.locator('.cm-content').click();
  await page.keyboard.press(`${mod}+f`);
  await expect(page.locator('.cm-panel.cm-search')).toBeVisible();
  // The panel autofocuses its input — type the query as keystrokes.
  await page.keyboard.type('hello', { delay: 30 });
  await expect(page.locator('.cm-searchMatch')).toHaveCount(2);
  // Enter jumps to the next match, which renders selected.
  await page.keyboard.press('Enter');
  await expect(page.locator('.cm-searchMatch-selected')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.cm-panel.cm-search')).toHaveCount(0);
});

test('trailing whitespace gets a lint warning', async ({ page }) => {
  await page.locator('.cm-content').click();
  await page.keyboard.type('has trailing  ', { delay: 10 });
  // Linter runs debounced.
  await expect(page.locator('.cm-lintRange-warning').first()).toBeVisible({ timeout: 8000 });
});

test('pasting a URL over a selection wraps it as a link', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await typeLines(page, ['hello world']);
  // Select `world` (5 chars back from line end).
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.evaluate(() => navigator.clipboard.writeText('https://x.dev'));
  await page.keyboard.press(`${mod}+v`);
  await expect(page.locator('.cm-content')).toContainText('[world](https://x.dev)');
});

test('pasting rich HTML converts to Markdown', async ({ page }) => {
  await page.locator('.cm-content').click();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/html', '<h1>Pasted</h1><p>a <b>b</b></p>');
    dt.setData('text/plain', 'Pasted a b');
    const target = document.querySelector('.cm-content');
    target?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt as DataTransfer, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('.cm-content')).toContainText('# Pasted');
  await expect(page.locator('.cm-content')).toContainText('a **b**');
});
