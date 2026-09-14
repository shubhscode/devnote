import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';

// 2.3 status bar + outline, 2.4 preview checkbox round-trip, 2.7 exports.

test.beforeEach(async ({ page }) => {
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
      // CodeMirror ignores Enter within interactionDelay of the last keystroke.
      await page.waitForTimeout(300);
      await page.keyboard.press('Enter');
    }
    await page.keyboard.type(line, { delay: 10 });
  }
}

test('status bar shows words, chars, reading time', async ({ page }) => {
  await typeLines(page, ['hello world foo bar']);
  await expect(page.getByText('4 words')).toBeVisible();
  await expect(page.getByText('19 chars')).toBeVisible();
  await expect(page.getByText('~1 min read')).toBeVisible();
});

test('outline lists headings and jumps on click', async ({ page }) => {
  await typeLines(page, ['# Alpha', '', 'body text here', '', '## Beta']);
  await page.getByTitle('Table of contents outline').click();
  await expect(page.getByRole('button', { name: 'Alpha' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Beta' })).toBeVisible();
  await page.getByRole('button', { name: 'Beta' }).click();
  // Jump focuses the editor at the heading; the outline closes.
  await expect(page.locator('.cm-content')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Alpha' })).toHaveCount(0);
});

test('preview checkbox toggles the task and persists', async ({ page }) => {
  // The editor auto-continues `- [ ] ` on Enter — type the text only.
  await typeLines(page, ['- [ ] buy milk', 'buy eggs']);
  await page.getByTitle('Side by side (mod+P)').click();
  const boxes = page.locator('.markdown-body input[type="checkbox"]');
  await expect(boxes).toHaveCount(2);
  await boxes.first().click();
  await expect(page.locator('.cm-content')).toContainText('- [x] buy milk');
  await page.reload();
  await page.getByTitle('Side by side (mod+P)').click();
  await expect(page.locator('.markdown-body input[type="checkbox"]').first()).toBeChecked();
});

test('preview heading click jumps the editor', async ({ page }) => {
  await typeLines(page, ['# Jump target', '', 'more text']);
  await page.getByTitle('Side by side (mod+P)').click();
  await page.locator('.markdown-body h1').click();
  await expect(page.locator('.cm-content')).toBeFocused();
});

test('export markdown downloads a reimportable file', async ({ page }) => {
  await typeLines(page, ['Export me']);
  await page.getByTitle('More actions').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Markdown' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  const path = await download.path();
  const content = fs.readFileSync(path!, 'utf-8');
  expect(content).toContain('Export me');
  expect(content).toContain('id:');
});

test('export html downloads a sanitized standalone doc', async ({ page }) => {
  await typeLines(page, ['# Styled', '', '<script>alert(1)</script>']);
  await page.getByTitle('More actions').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export HTML' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.html$/);
  const path = await download.path();
  const content = fs.readFileSync(path!, 'utf-8');
  expect(content).toContain('<!DOCTYPE html>');
  expect(content).not.toContain('<script>');
});
