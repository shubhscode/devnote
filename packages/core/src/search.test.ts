import { describe, expect, it } from 'vitest';
import {
  bestSnippet,
  findRanges,
  isExclusionsOnly,
  matchTerm,
  mergeRanges,
  nowIso,
  parseSearch,
  scoreNote,
  searchNotes,
  titleRanges,
} from './index';
import type { Note, Notebook } from './index';

function books(): Notebook[] {
  const now = nowIso();
  return [
    { id: 'blog', name: 'Blog', parentId: null, sortOrder: 0, createdAt: now, updatedAt: now },
    { id: 'back', name: 'Backend', parentId: null, sortOrder: 1, createdAt: now, updatedAt: now },
  ];
}

function note(over: Partial<Note> & { id: string }): Note {
  const now = nowIso();
  return {
    title: '', body: '', notebookId: 'blog', tags: [], status: 'none',
    pinned: false, trashed: false, createdAt: now, updatedAt: now, ...over,
  };
}

describe('parseSearch', () => {
  it('parses qualifiers, phrases, and exclusions', () => {
    const terms = parseSearch('-book:Backend "closure functions" tag:JavaScript -tag:ts status:onHold title:"Sprint 10" hello');
    expect(terms).toMatchObject([
      { field: 'book', value: 'Backend', exclude: true },
      { field: null, value: 'closure functions', exclude: false },
      { field: 'tag', value: 'JavaScript', exclude: false },
      { field: 'tag', value: 'ts', exclude: true },
      { field: 'status', value: 'onHold', exclude: false },
      { field: 'title', value: 'Sprint 10', exclude: false },
      { field: null, value: 'hello', exclude: false },
    ]);
  });

  it('handles exclusion-only and body: qualifier', () => {
    const terms = parseSearch('-book:Backend body:debounce -"ignore me"');
    expect(isExclusionsOnly(terms)).toBe(false); // body:debounce is positive
    expect(isExclusionsOnly(parseSearch('-tag:js -book:B'))).toBe(true);
    expect(isExclusionsOnly(parseSearch(''))).toBe(false);
  });
});

describe('matchTerm', () => {
  const n = note({ id: '1', title: 'Sprint 10 debounce', body: 'closure functions rock', tags: ['JavaScript'], status: 'onHold' });
  it('matches each field', () => {
    expect(matchTerm(n, books(), { field: 'book', value: 'blog', exclude: false })).toBe(true);
    expect(matchTerm(n, books(), { field: 'book', value: 'back', exclude: false })).toBe(false);
    expect(matchTerm(n, books(), { field: 'tag', value: 'javascript', exclude: false })).toBe(true);
    expect(matchTerm(n, books(), { field: 'status', value: 'onhold', exclude: false })).toBe(true);
    expect(matchTerm(n, books(), { field: 'title', value: 'sprint', exclude: false })).toBe(true);
    expect(matchTerm(n, books(), { field: 'body', value: 'closure', exclude: false })).toBe(true);
    expect(matchTerm(n, books(), { field: null, value: 'rock', exclude: false })).toBe(true);
    expect(matchTerm(n, books(), { field: null, value: 'missing', exclude: false })).toBe(false);
  });
});

describe('searchNotes', () => {
  const a = note({ id: 'a', title: 'Typescript generics', body: 'hello', tags: ['Work'], status: 'completed', updatedAt: '2026-01-02T00:00:00.000Z' });
  const b = note({ id: 'b', title: 'Hello world', body: 'typescript tips', tags: [], status: 'none', updatedAt: '2026-01-03T00:00:00.000Z' });
  const c = note({ id: 'c', title: 'Hello again', body: 'typescript deep dive typescript', tags: [], status: 'none', pinned: true, updatedAt: '2026-01-01T00:00:00.000Z' });

  it('ANDs qualifiers and ranks title > body', () => {
    const res = searchNotes([a, b], books(), 'typescript tag:Work status:Completed');
    expect(res.map((r) => r.note.id)).toEqual(['a']);
  });

  it('sorts pinned first, then score, then newest', () => {
    const res = searchNotes([a, b, c], books(), 'typescript');
    // c pinned first; a scores title-hit (3) over b body-hit (1)
    expect(res.map((r) => r.note.id)).toEqual(['c', 'a', 'b']);
  });

  it('applies exclusions; exclusions-only matches nothing', () => {
    expect(searchNotes([a, b], books(), 'typescript -tag:Work').map((r) => r.note.id)).toEqual(['b']);
    expect(searchNotes([a, b], books(), '-tag:Work')).toEqual([]);
  });

  it('scores deterministically', () => {
    const terms = parseSearch('typescript');
    expect(scoreNote(a, books(), terms)).toBeGreaterThan(scoreNote(b, books(), terms));
  });
});

describe('highlight ranges', () => {
  it('finds + merges occurrences', () => {
    expect(findRanges('Hello hello', 'hello')).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
    ]);
    expect(mergeRanges([{ start: 0, end: 5 }, { start: 3, end: 8 }, { start: 10, end: 12 }])).toEqual([
      { start: 0, end: 8 },
      { start: 10, end: 12 },
    ]);
  });

  it('titleRanges skips exclusions and body: terms', () => {
    const ranges = titleRanges('Sprint 10 debounce', parseSearch('sprint body:debounce -nothing'));
    expect(ranges).toEqual([{ start: 0, end: 6 }]);
  });

  it('bestSnippet prefers the matching line', () => {
    const s = bestSnippet('intro\n\nclosure functions rock\ntail', parseSearch('closure'));
    expect(s).toMatchObject({ text: 'closure functions rock', matched: true });
    expect(s.ranges).toEqual([{ start: 0, end: 7 }]);
    const plain = bestSnippet('intro\ntail', parseSearch('zzz'));
    expect(plain).toMatchObject({ text: 'intro', matched: false, ranges: [] });
  });
});
