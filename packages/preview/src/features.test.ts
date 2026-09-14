import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './index';
import { countTasks, setTaskChecked } from './tasks';
import { exportHtmlDoc } from './export';

describe('task checkbox indexing (2.4)', () => {
  it('stamps data-task-index in order and drops disabled', () => {
    const html = renderMarkdown('- [ ] a\n- [x] b\n\n1. [ ] c');
    expect(html).toContain('data-task-index="0"');
    expect(html).toContain('data-task-index="1"');
    expect(html).toContain('data-task-index="2"');
    expect(html).not.toContain('disabled');
  });

  it('ignores raw-HTML inputs outside task items', () => {
    const html = renderMarkdown('<input type="checkbox"> plain');
    expect(html).not.toContain('data-task-index');
  });

  it('indexes checkboxes in loose list items (li > p > input)', () => {
    const html = renderMarkdown('- [ ] a\n\n- [x] b');
    expect(html).toContain('data-task-index="0"');
    expect(html).toContain('data-task-index="1"');
    expect(html).not.toContain('disabled');
  });
});

describe('setTaskChecked', () => {
  it('toggles the nth task, preserving the rest byte-for-byte', () => {
    const body = '- [ ] a\n- [x] b\n\nSome  spacing  kept\n\n1. [ ] c';
    expect(setTaskChecked(body, 0, true)).toBe('- [x] a\n- [x] b\n\nSome  spacing  kept\n\n1. [ ] c');
    expect(setTaskChecked(body, 1, false)).toBe('- [ ] a\n- [ ] b\n\nSome  spacing  kept\n\n1. [ ] c');
    expect(setTaskChecked(body, 2, true)).toBe('- [ ] a\n- [x] b\n\nSome  spacing  kept\n\n1. [x] c');
  });

  it('handles nested tasks and single-char links before the box', () => {
    const body = '  * [ ] [a](https://x) nested';
    expect(setTaskChecked(body, 0, true)).toBe('  * [x] [a](https://x) nested');
  });

  it('ignores checkboxes inside fenced code and out-of-range indexes', () => {
    const body = '```\n- [ ] not a task\n```\n\n- [ ] real';
    expect(countTasks(body)).toBe(1);
    expect(setTaskChecked(body, 1, true)).toBe(body);
    expect(setTaskChecked(body, -1, true)).toBe(body);
    expect(setTaskChecked(body, 0, true)).toBe('```\n- [ ] not a task\n```\n\n- [x] real');
  });
});

describe('heading anchors (2.3)', () => {
  it('adds slug ids to headings (user-content- prefix, GitHub-style)', () => {
    const html = renderMarkdown('# Hello World\n\n## Hello World');
    expect(html).toContain('id="user-content-hello-world"');
  });

  it('numbers headings in document order', () => {
    const html = renderMarkdown('# A\n\ntext\n\n### B');
    expect(html).toContain('data-heading-index="0"');
    expect(html).toContain('data-heading-index="1"');
  });
});

describe('exportHtmlDoc (2.7)', () => {
  it('inlines theme vars, sanitizes body, escapes the title', () => {
    const html = exportHtmlDoc('<b>Q&A</b>', '# Hi\n\n<script>alert(1)</script>', {
      variables: { '--bg': '#111', '--fg': '#eee' },
    });
    expect(html).toContain('--bg: #111;');
    expect(html).toContain('<title>&lt;b&gt;Q&amp;A&lt;/b&gt;</title>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('id="user-content-hi"');
  });
});
