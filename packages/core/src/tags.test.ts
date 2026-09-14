import { describe, expect, it } from 'vitest';
import { createNote } from './notes';
import { mergeTags, normalizeTagName, renameTag, tagKey, untagNotes } from './tags';
import type { Note, Notebook } from './types';

const BOOKS: Notebook[] = [
  { id: 'b1', name: 'Inbox', parentId: null, sortOrder: 0, createdAt: 't', updatedAt: 't' },
];

function mk(tags: string[], extra?: Partial<Note>): Note {
  const { notes, note } = createNote([], BOOKS, { notebookId: 'b1' });
  void notes;
  return { ...note, tags, ...extra };
}

describe('tagKey / normalizeTagName', () => {
  it('folds case + trims for comparison', () => {
    expect(tagKey('  JS ')).toBe('js');
    expect(tagKey('js')).toBe('js');
    expect(normalizeTagName('  rust ')).toBe('rust');
  });
});

describe('renameTag', () => {
  it('renames case-insensitively, keeps order + casing of others', () => {
    const notes = [mk(['JS', 'web']), mk(['js', 'rust']), mk(['other'])];
    const next = renameTag(notes, 'js', 'javascript');
    expect(next[0]!.tags).toEqual(['javascript', 'web']);
    expect(next[1]!.tags).toEqual(['javascript', 'rust']);
    expect(next[2]!.tags).toEqual(['other']);
  });

  it('dedupes when target already present (any casing)', () => {
    const notes = [mk(['js', 'JavaScript', 'web'])];
    expect(renameTag(notes, 'js', 'javascript')[0]!.tags).toEqual(['javascript', 'web']);
  });

  it('touches trashed notes too (history stays consistent)', () => {
    const notes = [mk(['js'], { trashed: true })];
    expect(renameTag(notes, 'JS', 'ts')[0]!.tags).toEqual(['ts']);
  });

  it('trims names, throws on blank', () => {
    const notes = [mk(['a'])];
    expect(renameTag(notes, 'a', '  b  ')[0]!.tags).toEqual(['b']);
    expect(() => renameTag(notes, 'a', '   ')).toThrow('must not be blank');
    expect(() => renameTag(notes, '  ', 'b')).toThrow('must not be blank');
  });

  it('no-ops (same content) when tag absent', () => {
    const notes = [mk(['a'])];
    const next = renameTag(notes, 'missing', 'b');
    expect(next[0]!.tags).toEqual(['a']);
    expect(next[0]).toBe(notes[0]); // untouched ref kept
  });
});

describe('mergeTags', () => {
  it('merges several sources into target', () => {
    const notes = [mk(['js', 'ts']), mk(['web', 'js']), mk(['other'])];
    const next = mergeTags(notes, ['js', 'ts'], 'javascript');
    expect(next[0]!.tags).toEqual(['javascript']);
    expect(next[1]!.tags).toEqual(['web', 'javascript']);
    expect(next[2]!.tags).toEqual(['other']);
  });

  it('skips sources equal to target, throws when nothing left', () => {
    const notes = [mk(['a'])];
    expect(() => mergeTags(notes, [], 'b')).toThrow('nothing to merge');
    expect(() => mergeTags(notes, ['B'], 'b')).toThrow('nothing to merge');
    expect(() => mergeTags(notes, ['a'], '  ')).toThrow('must not be blank');
  });
});

describe('untagNotes', () => {
  it('removes tag case-insensitively, keeps rest', () => {
    const notes = [mk(['JS', 'web']), mk(['other'])];
    const next = untagNotes(notes, 'js');
    expect(next[0]!.tags).toEqual(['web']);
    expect(next[1]).toBe(notes[1]);
  });

  it('throws on blank name', () => {
    expect(() => untagNotes([mk(['a'])], ' ')).toThrow('must not be blank');
  });
});
