import { describe, expect, it } from 'vitest';
import { buildNotebookTree, parseSearchQuery } from './index.js';

const now = new Date().toISOString();

describe('buildNotebookTree', () => {
  it('nests children under parents sorted by sortOrder', () => {
    const tree = buildNotebookTree([
      { id: 'b', name: 'B', parentId: 'a', sortOrder: 0, createdAt: now, updatedAt: now },
      { id: 'a', name: 'A', parentId: null, sortOrder: 0, createdAt: now, updatedAt: now },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.notebook.id).toBe('a');
    expect(tree[0]?.children.map((c) => c.notebook.id)).toEqual(['b']);
  });

  it('throws on orphan parent', () => {
    expect(() =>
      buildNotebookTree([
        { id: 'x', name: 'X', parentId: 'missing', sortOrder: 0, createdAt: now, updatedAt: now },
      ]),
    ).toThrow(/orphan/);
  });

  it('throws on cycle', () => {
    expect(() =>
      buildNotebookTree([
        { id: 'a', name: 'A', parentId: 'b', sortOrder: 0, createdAt: now, updatedAt: now },
        { id: 'b', name: 'B', parentId: 'a', sortOrder: 0, createdAt: now, updatedAt: now },
      ]),
    ).toThrow(/cycle/);
  });
});

describe('parseSearchQuery', () => {
  it('extracts book/tag/status qualifiers', () => {
    const q = parseSearchQuery('Typescript tag:Work status:Completed book:Blog hello');
    expect(q).toMatchObject({ book: 'Blog', status: 'Completed', tags: ['Work'] });
    expect(q.text).toContain('Typescript');
  });
});
