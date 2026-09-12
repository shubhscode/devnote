import { describe, expect, it } from 'vitest';
import {
  buildNotebookTree,
  countDirectNotes,
  createNotebook,
  deleteNotebook,
  descendantIds,
  moveNotebook,
  notebookPath,
  renameNotebook,
  nowIso,
} from './index';
import type { Notebook, Note } from './index';

function nb(
  id: string,
  name: string,
  parentId: string | null = null,
  sortOrder = 0,
): Notebook {
  const now = nowIso();
  return { id, name, parentId, sortOrder, createdAt: now, updatedAt: now };
}

function note(id: string, notebookId: string, trashed = false): Note {
  const now = nowIso();
  return {
    id,
    title: id,
    body: '',
    notebookId,
    tags: [],
    status: 'none',
    pinned: false,
    trashed,
    createdAt: now,
    updatedAt: now,
  };
}

describe('buildNotebookTree', () => {
  it('nests children under parents sorted by sortOrder', () => {
    const tree = buildNotebookTree([nb('b', 'B', 'a'), nb('a', 'A')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.notebook.id).toBe('a');
    expect(tree[0]?.children.map((c) => c.notebook.id)).toEqual(['b']);
  });

  it('throws on orphan parent', () => {
    expect(() => buildNotebookTree([nb('x', 'X', 'missing')])).toThrow(/orphan/);
  });

  it('throws on cycle', () => {
    expect(() => buildNotebookTree([nb('a', 'A', 'b'), nb('b', 'B', 'a')])).toThrow(/cycle/);
  });
});

describe('createNotebook', () => {
  it('appends with next sortOrder among siblings', () => {
    const start = [nb('a', 'A', null, 0)];
    const next = createNotebook(start, { name: ' B ' });
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ name: 'B', parentId: null, sortOrder: 1 });
  });

  it('rejects empty names and missing parents', () => {
    expect(() => createNotebook([], { name: '  ' })).toThrow(/empty/);
    expect(() => createNotebook([], { name: 'X', parentId: 'nope' })).toThrow(/not found/);
  });
});

describe('renameNotebook / moveNotebook', () => {
  it('renames and rejects empties', () => {
    const next = renameNotebook([nb('a', 'A')], 'a', 'Alpha');
    expect(next[0]?.name).toBe('Alpha');
    expect(() => renameNotebook([nb('a', 'A')], 'a', ' ')).toThrow(/empty/);
    expect(() => renameNotebook([nb('a', 'A')], 'missing', 'X')).toThrow(/not found/);
  });

  it('blocks moves into self or descendants', () => {
    const books = [nb('a', 'A'), nb('b', 'B', 'a')];
    expect(() => moveNotebook(books, 'a', 'a')).toThrow(/itself/);
    expect(() => moveNotebook(books, 'a', 'b')).toThrow(/descendant/);
    const moved = moveNotebook(books, 'b', null);
    expect(moved.find((n) => n.id === 'b')?.parentId).toBeNull();
  });
});

describe('deleteNotebook', () => {
  it('blocks delete with children or live notes', () => {
    const books = [nb('a', 'A'), nb('b', 'B', 'a')];
    expect(() => deleteNotebook(books, [], 'a')).toThrow(/sub-notebooks/);
    expect(() => deleteNotebook([nb('a', 'A')], [note('n1', 'a')], 'a')).toThrow(/has notes/);
  });

  it('deletes empty notebooks, ignores trashed notes', () => {
    const next = deleteNotebook([nb('a', 'A')], [note('n1', 'a', true)], 'a');
    expect(next).toHaveLength(0);
  });
});

describe('helpers', () => {
  it('notebookPath joins ancestor names', () => {
    const books = [nb('a', 'Projects'), nb('b', 'devnote', 'a')];
    expect(notebookPath(books, 'b')).toBe('Projects / devnote');
  });

  it('descendantIds + countDirectNotes', () => {
    const books = [nb('a', 'A'), nb('b', 'B', 'a'), nb('c', 'C', 'b')];
    expect(descendantIds(books, 'a').sort()).toEqual(['b', 'c']);
    const counts = countDirectNotes([note('n1', 'a'), note('n2', 'a'), note('n3', 'b', true)]);
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBeUndefined();
  });
});
