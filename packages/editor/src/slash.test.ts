import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { applyEdit } from './text';
import { filterSlashItems, SLASH_ITEMS } from './slash';
import { inCodeBlock, slashRange } from './view';

function stateWith(doc: string, pos?: number): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor: pos ?? doc.length },
    extensions: [markdown()],
  });
}

describe('filterSlashItems', () => {
  it('returns all on empty, filters on text', () => {
    expect(filterSlashItems('')).toHaveLength(SLASH_ITEMS.length);
    expect(filterSlashItems('head').map((i) => i.id)).toEqual(['h1', 'h2', 'h3']);
    expect(filterSlashItems('todo').map((i) => i.id)).toEqual(['task']);
    expect(filterSlashItems('zzz')).toHaveLength(0);
  });
});

describe('slash item edits', () => {
  it('heading replaces the /query line', () => {
    const h1 = SLASH_ITEMS.find((i) => i.id === 'h1')!;
    const edits = h1.run('/h', 0, 0, 2);
    expect(applyEdit('/h', edits[0]!)).toBe('# ');
  });

  it('code block places the cursor inside', () => {
    const code = SLASH_ITEMS.find((i) => i.id === 'code')!;
    const edits = code.run('/code', 0, 0, 5);
    const out = applyEdit('/code', edits[0]!);
    expect(out).toBe('```\n\n```');
    expect(edits[0]?.selStart).toBe(4);
  });

  it('task inserts a checkbox prefix', () => {
    const task = SLASH_ITEMS.find((i) => i.id === 'task')!;
    const edits = task.run('  /task', 0, 2, 7);
    expect(applyEdit('  /task', edits[0]!)).toBe('- [ ] ');
  });
});

describe('slashRange', () => {
  it('detects /query at end of an empty-ish line', () => {
    const st = stateWith('hello\n/task');
    const r = slashRange(st);
    expect(r).toMatchObject({ lineStart: 6, from: 6, to: 11, query: 'task' });
  });

  it('rejects mid-line slashes and trailing text', () => {
    expect(slashRange(stateWith('a /b'))).toBeNull(); // mid-line
    expect(slashRange(stateWith('/task tomorrow'))).toBeNull(); // trailing text
    expect(slashRange(stateWith('/task '))).not.toBeNull(); // trailing space ok
  });

  it('requires an empty selection', () => {
    const st = EditorState.create({
      doc: '/task',
      selection: { anchor: 0, head: 5 },
      extensions: [markdown()],
    });
    expect(slashRange(st)).toBeNull();
  });
});

describe('inCodeBlock', () => {
  it('detects fenced code regions', () => {
    const st = stateWith('```js\nconst a = /x;\n```\n\nplain /y');
    expect(inCodeBlock(st, 12)).toBe(true);
    expect(inCodeBlock(st, st.doc.length)).toBe(false);
  });
});
