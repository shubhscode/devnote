import { describe, expect, it } from 'vitest';
import { applyEdit, insertLink, isWrapped, toggleAlertBlock, toggleFenceBlock, toggleLinePrefix, toggleOrdered, toggleTask, toggleWrap } from './text';
import type { Edit } from './text';

/** Apply simultaneous multi-edits in order (mirrors view.applyEdits). */
function applyAll(text: string, edits: Edit[]): string {
  let next = text;
  let shift = 0;
  for (const e of edits) {
    next = applyEdit(next, { ...e, from: e.from + shift, to: e.to + shift, selStart: 0, selEnd: 0 });
    shift += e.insert.length - (e.to - e.from);
  }
  return next;
}

describe('toggleWrap', () => {
  it('wraps a selection and unwraps it back', () => {
    const wrapped = toggleWrap('hello world', 6, 11, '**');
    expect(applyEdit('hello world', wrapped)).toBe('hello **world**');
    const back = toggleWrap('hello **world**', 8, 13, '**');
    expect(applyEdit('hello **world**', back)).toBe('hello world');
  });

  it('inserts an empty pair on a caret', () => {
    const e = toggleWrap('ab', 1, 1, '*');
    expect(applyEdit('ab', e)).toBe('a**b');
    expect(e.selStart).toBe(2);
  });
});

describe('toggleLinePrefix', () => {
  it('quotes and unquotes a block', () => {
    const text = 'one\ntwo';
    const quoted = toggleLinePrefix(text, 0, 7, '> ');
    let next = text;
    let shift = 0;
    for (const e of quoted) {
      next = applyEdit(next, { ...e, from: e.from + shift, to: e.to + shift, selStart: 0, selEnd: 0 });
      shift += e.insert.length - (e.to - e.from);
    }
    expect(next).toBe('> one\n> two');
    const unquoted = toggleLinePrefix(next, 0, next.length, '> ');
    let back = next;
    let s2 = 0;
    for (const e of unquoted) {
      back = applyEdit(back, { ...e, from: e.from + s2, to: e.to + s2, selStart: 0, selEnd: 0 });
      s2 += e.insert.length - (e.to - e.from);
    }
    expect(back).toBe('one\ntwo');
  });
});

describe('toggleTask', () => {
  it('cycles checkbox states', () => {
    const e1 = toggleTask('- buy milk', 0, 0);
    expect(applyEdit('- buy milk', e1[0]!)).toBe('- [ ] buy milk');
    const e2 = toggleTask('- [ ] buy milk', 0, 0);
    expect(applyEdit('- [ ] buy milk', e2[0]!)).toBe('- [x] buy milk');
    const e3 = toggleTask('- [x] buy milk', 0, 0);
    expect(applyEdit('- [x] buy milk', e3[0]!)).toBe('- [ ] buy milk');
  });
});

describe('isWrapped', () => {
  it('detects surrounding markers for active states', () => {
    expect(isWrapped('hello **world**', 8, 13, '**')).toBe(true);
    expect(isWrapped('hello **world**', 8, 13, '*')).toBe(false);
    expect(isWrapped('a `b` c', 3, 4, '`')).toBe(true);
    expect(isWrapped('abc', 1, 1, '*')).toBe(false);
  });
});

describe('insertLink', () => {
  it('wraps selection and selects the url placeholder', () => {
    const e = insertLink('docs here', 0, 4);
    const out = applyEdit('docs here', e);
    expect(out).toBe('[docs](url) here');
    expect(out.slice(e.selStart, e.selEnd)).toBe('url');
  });
});

describe('toggleOrdered', () => {
  it('numbers lines and strips them back', () => {
    const text = 'one\ntwo';
    expect(applyAll(text, toggleOrdered(text, 0, 7))).toBe('1. one\n1. two');
    expect(applyAll('1. one\n2. two', toggleOrdered('1. one\n2. two', 0, 13))).toBe('one\ntwo');
  });
});

describe('toggleFenceBlock', () => {
  it('wraps lines and unwraps an exact fence', () => {
    const text = 'const a = 1;';
    const wrapped = applyAll(text, toggleFenceBlock(text, 0, 12));
    expect(wrapped).toBe('```\nconst a = 1;\n```');
    expect(applyAll(wrapped, toggleFenceBlock(wrapped, 0, wrapped.length))).toBe(text);
  });
});

describe('toggleAlertBlock', () => {
  it('wraps, switches kind, and unwraps', () => {
    const text = 'heads up\nsecond line';
    const wrapped = applyAll(text, toggleAlertBlock(text, 0, 17, 'NOTE'));
    expect(wrapped).toBe('> [!NOTE] heads up\n> second line');
    const switched = applyAll(wrapped, toggleAlertBlock(wrapped, 0, wrapped.length, 'WARNING'));
    expect(switched).toBe('> [!WARNING] heads up\n> second line');
    expect(applyAll(switched, toggleAlertBlock(switched, 0, switched.length, 'WARNING'))).toBe(text);
  });
});
