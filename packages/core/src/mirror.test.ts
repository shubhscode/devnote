import { describe, expect, it } from 'vitest';
import {
  extractFileId,
  filenameToTitle,
  noteFilename,
  noteRelativePath,
  noteToMarkdown,
  parseMirrorNote,
  planExport,
  planImport,
  resolveNotebookPath,
  sanitizeSegment,
  slugify,
} from './index';
import { nowIso } from './index';
import type { Note, Notebook } from './index';

function books(): Notebook[] {
  const now = nowIso();
  return [
    { id: 'p', name: 'Projects', parentId: null, sortOrder: 0, createdAt: now, updatedAt: now },
    { id: 'd', name: 'devnote', parentId: 'p', sortOrder: 0, createdAt: now, updatedAt: now },
  ];
}

function note(over: Partial<Note> = {}): Note {
  const now = nowIso();
  return {
    id: '12345678-aaaa-bbbb-cccc-000000000000',
    title: 'Hello World',
    body: 'Some *body* here.',
    notebookId: 'd',
    tags: ['dev'],
    status: 'active',
    pinned: false,
    trashed: false,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

describe('paths', () => {
  it('sanitizes segments and slugs', () => {
    expect(sanitizeSegment('a/b\\c')).toBe('a-b-c');
    expect(sanitizeSegment('  ')).toBe('Untitled');
    expect(slugify('Hello, World!')).toBe('hello-world');
    expect(slugify('')).toBe('untitled');
  });

  it('builds stable nested paths', () => {
    expect(noteRelativePath(note(), books())).toBe('Projects/devnote/hello-world-12345678.md');
    expect(noteRelativePath(note({ notebookId: 'missing' }), books())).toBe('Unsorted/hello-world-12345678.md');
    expect(noteFilename(note({ title: '' }))).toBe('untitled-12345678.md');
  });

  it('resolves + creates notebook chains case-insensitively', () => {
    const { notebooks, id, created } = resolveNotebookPath(books(), 'projects/NEW');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ name: 'NEW', parentId: 'p' });
    const again = resolveNotebookPath(notebooks, 'Projects/new');
    expect(again.created).toHaveLength(0);
    expect(again.id).toBe(id);
  });
});

describe('round-trip', () => {
  it('serializes and parses back identically', () => {
    const n = note();
    const md = noteToMarkdown(n, books());
    expect(md.startsWith('---\n')).toBe(true);
    const { note: parsed } = parseMirrorNote(md, 'x.md');
    expect(parsed).toMatchObject({
      id: n.id, title: n.title, body: 'Some *body* here.\n', tags: ['dev'], status: 'active',
    });
  });

  it('extracts ids and guesses titles', () => {
    expect(extractFileId(noteToMarkdown(note(), books()))).toBe(note().id);
    expect(extractFileId('no frontmatter')).toBeNull();
    expect(filenameToTitle('notes/my-cool-note-a1b2c3d4.md')).toBe('my cool note');
    const { note: h1 } = parseMirrorNote('# Real Title\n\nbody\n', 'x.md');
    expect(h1.title).toBe('Real Title');
  });

  it('rejects bad status, coerces flags', () => {
    const { note: parsed } = parseMirrorNote('---\nstatus: bogus\npinned: yes\n---\nbody\n', 'x.md');
    expect(parsed.status).toBe('none');
    expect(parsed.pinned).toBe(false);
  });
});

describe('planImport', () => {
  it('creates notes + notebooks from files', () => {
    const md = noteToMarkdown(note(), books());
    const res = planImport([], [], [{ path: 'Projects/devnote/hello-world-12345678.md', content: md }]);
    expect(res.created).toBe(1);
    expect(res.updated).toBe(0);
    expect(res.notebooks.map((n) => n.name)).toEqual(['Projects', 'devnote']);
    expect(res.notes[0]?.notebookId).toBe(res.notebooks[1]?.id);
  });

  it('newer file wins; older file skipped', () => {
    const n = note({ updatedAt: '2026-01-02T00:00:00.000Z' });
    const newer = noteToMarkdown({ ...n, title: 'New', updatedAt: '2026-01-03T00:00:00.000Z' }, books());
    const older = noteToMarkdown({ ...n, title: 'Old', updatedAt: '2026-01-01T00:00:00.000Z' }, books());
    const r1 = planImport([n], books(), [{ path: 'x.md', content: newer }]);
    expect(r1.updated).toBe(1);
    expect(r1.notes[0]?.title).toBe('New');
    const r2 = planImport([n], books(), [{ path: 'x.md', content: older }]);
    expect(r2.updated).toBe(0);
    expect(r2.notes[0]?.title).toBe(n.title);
  });

  it('adopts id-less files with a write-back', () => {
    const res = planImport([], books(), [{ path: 'misc/note.md', content: '# Hi\n\nbody\n' }]);
    expect(res.created).toBe(1);
    expect(res.adoptions).toHaveLength(1);
    expect(extractFileId(res.adoptions[0]!.content)).toBe(res.notes[0]?.id);
    // Second import is a stable no-op.
    const files = [{ path: 'misc/note.md', content: res.adoptions[0]!.content }];
    const r2 = planImport(res.notes, res.notebooks, files);
    expect(r2.created).toBe(0);
    expect(r2.updated).toBe(0);
  });
});

describe('planExport', () => {
  it('writes changed, skips identical, prunes moved/deleted', () => {
    const n = note();
    const md = noteToMarkdown(n, books());
    const same = planExport([n], books(), [{ path: 'Projects/devnote/hello-world-12345678.md', content: md }]);
    expect(same).toMatchObject({ skipped: 1 });
    expect(same.writes).toHaveLength(0);

    const moved = planExport(
      [{ ...n, title: 'Renamed' }],
      books(),
      [{ path: 'Projects/devnote/hello-world-12345678.md', content: md }],
    );
    expect(moved.writes.map((w) => w.path)).toEqual(['Projects/devnote/renamed-12345678.md']);
    expect(moved.deletes).toEqual(['Projects/devnote/hello-world-12345678.md']);

    const gone = planExport([], books(), [{ path: 'x.md', content: md }]);
    expect(gone.deletes).toEqual(['x.md']);

    // User files without ids are never touched.
    const user = planExport([], books(), [{ path: 'README.md', content: '# hi\n' }]);
    expect(user.deletes).toEqual([]);
    expect(user.writes).toEqual([]);
  });
});
