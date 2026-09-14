import { describe, expect, it } from 'vitest';
import {
  allTags,
  createNote,
  deleteNotesPermanently,
  duplicateNote,
  moveNotes,
  nowIso,
  restoreNotes,
  setNotesPinned,
  setNotesStatus,
  sortNotes,
  tagNotes,
  trashNotes,
  updateNote,
} from './index';
import type { Notebook, Note } from './index';

function books(): Notebook[] {
  const now = nowIso();
  return [
    { id: 'inbox', name: 'Inbox', parentId: null, sortOrder: 0, createdAt: now, updatedAt: now },
    { id: 'proj', name: 'Projects', parentId: null, sortOrder: 1, createdAt: now, updatedAt: now },
  ];
}

function seed(): Note[] {
  const { notes } = createNote([], books(), { notebookId: 'inbox', title: 'Hello' });
  return notes;
}

describe('createNote / updateNote', () => {
  it('creates at top with defaults', () => {
    const { note } = createNote([], books(), { notebookId: 'inbox' });
    expect(note).toMatchObject({ title: '', tags: [], status: 'none', trashed: false });
  });

  it('rejects unknown notebooks and statuses', () => {
    const s = seed();
    expect(() => createNote([], books(), { notebookId: 'nope' })).toThrow(/not found/);
    expect(() => updateNote(s, books(), s[0]!.id, { status: 'bogus' as never })).toThrow(
      /invalid status/,
    );
  });

  it('updates patch + dedupes/trims tags', () => {
    const s = seed();
    const id = s[0]!.id;
    const next = updateNote(s, books(), id, {
      title: 'New',
      tags: [' b ', 'a', 'a', ''],
      pinned: true,
    });
    expect(next[0]).toMatchObject({ title: 'New', tags: ['b', 'a'], pinned: true });
  });

  it('throws on missing note', () => {
    expect(() => updateNote([], books(), 'missing', { title: 'x' })).toThrow(/not found/);
  });
});

describe('duplicate / trash / restore / delete', () => {
  it('duplicates with a new id, same content', () => {
    const s = seed();
    const id = s[0]!.id;
    const { note } = duplicateNote(s, id);
    expect(note.id).not.toBe(id);
    expect(note.title).toBe('Hello');
  });

  it('trash -> restore -> permanent delete', () => {
    const s = seed();
    const id = s[0]!.id;
    const trashed = trashNotes(s, [id]);
    expect(trashed[0]?.trashed).toBe(true);

    const restored = restoreNotes(trashed, books(), [id], 'proj');
    expect(restored[0]).toMatchObject({ trashed: false, notebookId: 'proj' });

    expect(() => deleteNotesPermanently(s, [id])).toThrow(/not in trash/);
    const gone = deleteNotesPermanently(trashNotes(s, [id]), [id]);
    expect(gone).toHaveLength(0);
  });

  it('restore rejects unknown target / nothing trashed', () => {
    const s = seed();
    expect(() => restoreNotes(s, books(), [s[0]!.id], 'proj')).toThrow(/no trashed/);
    const trashed = trashNotes(s, [s[0]!.id]);
    expect(() => restoreNotes(trashed, books(), [s[0]!.id], 'nope')).toThrow(/not found/);
  });
});

describe('allTags / sortNotes', () => {
  it('collects unique sorted tags from live notes', () => {
    const s = seed();
    const a = updateNote(s, books(), s[0]!.id, { tags: ['zebra', 'apple'] });
    expect(allTags(a)).toEqual(['apple', 'zebra']);
    expect(allTags(trashNotes(a, [a[0]!.id]))).toEqual([]);
  });

  it('sorts pinned first, then newest', () => {
    const base = seed();
    const second = createNote(base, books(), { notebookId: 'inbox', title: 'Second' }).notes;
    const pinned = updateNote(second, books(), second[1]!.id, { pinned: true });
    const sorted = sortNotes(pinned);
    expect(sorted[0]?.id).toBe(second[1]!.id);
  });

  it('sorts by title A-Z (case-insensitive), pinned still first', () => {
    let ns = seed();
    ns = createNote(ns, books(), { notebookId: 'inbox', title: 'banana' }).notes;
    ns = createNote(ns, books(), { notebookId: 'inbox', title: 'Apple' }).notes;
    ns = createNote(ns, books(), { notebookId: 'inbox', title: 'cherry' }).notes;
    const titles = sortNotes(ns, 'title').map((n) => n.title);
    expect(titles).toEqual(['Apple', 'banana', 'cherry', 'Hello']);
  });

  it('sorts by createdAt desc', () => {
    const mk = (id: string, createdAt: string, updatedAt: string): Note => ({
      id, title: id, body: '', notebookId: 'inbox', tags: [], status: 'none',
      pinned: false, trashed: false, createdAt, updatedAt,
    });
    const ns = [
      mk('old', '2026-01-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
      mk('new', '2026-03-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'),
    ];
    expect(sortNotes(ns, 'created').map((n) => n.id)).toEqual(['new', 'old']);
    expect(sortNotes(ns).map((n) => n.id)).toEqual(['old', 'new']); // default stays updated
  });
});

describe('bulk note ops', () => {
  it('moveNotes retargets + validates notebook', () => {
    const s = seed();
    const id = s[0]!.id;
    const next = moveNotes(s, books(), [id], 'proj');
    expect(next[0]).toMatchObject({ notebookId: 'proj' });
    expect(() => moveNotes(s, books(), [id], 'nope')).toThrow(/not found/);
  });

  it('tagNotes adds once, trims, rejects blanks', () => {
    const s = seed();
    const id = s[0]!.id;
    const once = tagNotes(s, [id], '  Work ');
    expect(once[0]!.tags).toEqual(['Work']);
    expect(tagNotes(once, [id], 'work')[0]).toBe(once[0]); // case-dup skipped
    expect(() => tagNotes(s, [id], '   ')).toThrow(/blank/);
  });

  it('setNotesStatus validates, setNotesPinned toggles', () => {
    const s = seed();
    const id = s[0]!.id;
    expect(setNotesStatus(s, [id], 'active')[0]).toMatchObject({ status: 'active' });
    expect(() => setNotesStatus(s, [id], 'bogus' as never)).toThrow(/invalid status/);
    expect(setNotesPinned(s, [id], true)[0]).toMatchObject({ pinned: true });
  });
});
