import { describe, expect, it } from 'vitest';
import { htmlToMarkdown, normalizeLists, pasteUrlEdit } from './paste';
import { markdownLint } from './lint';

describe('pasteUrlEdit', () => {
  it('wraps a selection in a link for http(s) pastes', () => {
    expect(pasteUrlEdit('see this here', 4, 8, 'https://x.dev')).toEqual({
      from: 4, to: 8, insert: '[this](https://x.dev)', selStart: 4, selEnd: 25,
    });
  });

  it('passes through on collapsed cursors, non-URLs, empty selections', () => {
    expect(pasteUrlEdit('abc', 1, 1, 'https://x.dev')).toBeNull();
    expect(pasteUrlEdit('see this', 4, 8, 'not a url')).toBeNull();
    expect(pasteUrlEdit('see this', 4, 8, 'ftp://x.dev')).toBeNull();
    expect(pasteUrlEdit('', 0, 0, 'https://x.dev')).toBeNull();
  });
});

describe('htmlToMarkdown', () => {
  it('converts headings, bold, links, code, lists', () => {
    const md = htmlToMarkdown('<h1>T</h1><p>a <b>b</b> <a href="https://x.dev">x</a></p><ul><li>one</li></ul>');
    expect(md).toContain('# T');
    expect(md).toContain('a **b**');
    expect(md).toContain('[x](https://x.dev)');
    expect(md).toContain('- one');
  });

  it('keeps GFM tables and task lists', () => {
    const md = htmlToMarkdown('<table><tr><th>a</th></tr><tr><td>1</td></tr></table><ul><li><input type="checkbox" checked> done</li></ul>');
    expect(md).toContain('| a |');
    expect(md).toContain('- [x] done');
  });

  it('normalizes padded list markers, keeps hard breaks', () => {
    expect(normalizeLists('-   one\n-   [x]  done')).toBe('- one\n- [x] done');
    expect(normalizeLists('line  \nnext')).toBe('line  \nnext');
  });
});

describe('markdownLint', () => {
  it('flags trailing whitespace, stacked blanks, unclosed fences', () => {
    const hits = markdownLint('ok  \n\n\nnext\n```ts\ncode');
    expect(hits.map((h) => h.message)).toEqual([
      'Trailing whitespace',
      'Multiple blank lines',
      'Unclosed fenced code block',
    ]);
  });

  it('stays quiet inside fences and on clean docs', () => {
    expect(markdownLint('# T\n\nprose  \n'.replace('  \n', '\n'))).toEqual([]);
    expect(markdownLint('```\ntrailing  \n\n\n```')).toEqual([]);
  });
});
