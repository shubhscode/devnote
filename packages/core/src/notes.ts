// Note CRUD + trash/restore ops. Pure functions — no IO. See PLAN.md §5 (#3).
import { NOTE_STATUSES, generateId, nowIso } from './types';
import type { Note, NoteStatus, Notebook } from './types';

function notebookExists(notebooks: Notebook[], id: string): boolean {
  return notebooks.some((n) => n.id === id);
}

function normalizeTags(tags: string[]): string[] {
  // Trim + dedupe case-insensitively (`JS` = `js`), first-seen casing wins.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const trimmed = t.trim();
    const key = trimmed.toLowerCase();
    if (trimmed !== '' && !seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

export function createNote(
  notes: Note[],
  notebooks: Notebook[],
  input: { notebookId: string; title?: string; body?: string },
): { notes: Note[]; note: Note } {
  if (!notebookExists(notebooks, input.notebookId)) {
    throw new Error(`notebook not found: ${input.notebookId}`);
  }
  const now = nowIso();
  const note: Note = {
    id: generateId(),
    title: input.title ?? '',
    body: input.body ?? '',
    notebookId: input.notebookId,
    tags: [],
    status: 'none',
    pinned: false,
    trashed: false,
    createdAt: now,
    updatedAt: now,
  };
  return { notes: [note, ...notes], note };
}

export interface NotePatch {
  title?: string;
  body?: string;
  tags?: string[];
  status?: NoteStatus;
  pinned?: boolean;
  notebookId?: string;
}

export function updateNote(
  notes: Note[],
  notebooks: Notebook[],
  id: string,
  patch: NotePatch,
): Note[] {
  if (patch.status !== undefined && !NOTE_STATUSES.includes(patch.status)) {
    throw new Error(`invalid status: ${patch.status}`);
  }
  if (patch.notebookId !== undefined && !notebookExists(notebooks, patch.notebookId)) {
    throw new Error(`notebook not found: ${patch.notebookId}`);
  }
  let found = false;
  const next = notes.map((n) => {
    if (n.id !== id) return n;
    found = true;
    return {
      ...n,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.tags !== undefined ? { tags: normalizeTags(patch.tags) } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
      ...(patch.notebookId !== undefined ? { notebookId: patch.notebookId } : {}),
      updatedAt: nowIso(),
    };
  });
  if (!found) throw new Error(`note not found: ${id}`);
  return next;
}

/** Duplicate into the same notebook (same title/tags/status). */
export function duplicateNote(
  notes: Note[],
  id: string,
): { notes: Note[]; note: Note } {
  const original = notes.find((n) => n.id === id);
  if (!original) throw new Error(`note not found: ${id}`);
  const now = nowIso();
  const copy: Note = {
    ...original,
    id: generateId(),
    trashed: false,
    createdAt: now,
    updatedAt: now,
  };
  return { notes: [copy, ...notes], note: copy };
}

/** Soft-delete: trashed=true. Restore via restoreNotes. */
export function trashNotes(notes: Note[], ids: string[]): Note[] {
  const set = new Set(ids);
  return notes.map((n) => (set.has(n.id) ? { ...n, trashed: true, updatedAt: nowIso() } : n));
}

/** Restore trashed notes into a target notebook (Move-to-Notebook dialog). */
export function restoreNotes(
  notes: Note[],
  notebooks: Notebook[],
  ids: string[],
  targetNotebookId: string,
): Note[] {
  if (!notebookExists(notebooks, targetNotebookId)) {
    throw new Error(`notebook not found: ${targetNotebookId}`);
  }
  const set = new Set(ids);
  let restored = 0;
  const next = notes.map((n) => {
    if (!set.has(n.id) || !n.trashed) return n;
    restored += 1;
    return { ...n, trashed: false, notebookId: targetNotebookId, updatedAt: nowIso() };
  });
  if (restored === 0) throw new Error('no trashed notes selected');
  return next;
}

/** Permanent delete. Only allowed for trashed notes with explicit confirm (UI). */
export function deleteNotesPermanently(notes: Note[], ids: string[]): Note[] {
  const set = new Set(ids);
  for (const n of notes) {
    if (set.has(n.id) && !n.trashed) {
      throw new Error(`note is not in trash: ${n.id} — trash it first`);
    }
  }
  return notes.filter((n) => !set.has(n.id));
}

/** Unique sorted tag list across non-trashed notes (for autocomplete). Case-folded, first-seen casing wins. */
export function allTags(notes: Note[]): string[] {
  const seen = new Map<string, string>();
  for (const n of notes) {
    if (n.trashed) continue;
    for (const t of n.tags) {
      const key = t.trim().toLowerCase();
      if (key !== '' && !seen.has(key)) seen.set(key, t);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Note-list sort orders. Pinned notes stay first in every order. */
export type NoteSortKey = 'updated' | 'created' | 'title';

/** Sort: pinned first, then the key (updated/created desc, title A–Z), ties by updatedAt desc. */
export function sortNotes(notes: Note[], key: NoteSortKey = 'updated'): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (key === 'title') {
      const t = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      if (t !== 0) return t;
    } else if (key === 'created') {
      const c = b.createdAt.localeCompare(a.createdAt);
      if (c !== 0) return c;
    } else {
      const u = b.updatedAt.localeCompare(a.updatedAt);
      if (u !== 0) return u;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

/** Move notes to another notebook (trashed state kept). Throws on unknown notebook. */
export function moveNotes(
  notes: Note[],
  notebooks: Notebook[],
  ids: string[],
  notebookId: string,
): Note[] {
  if (!notebooks.some((n) => n.id === notebookId)) {
    throw new Error(`notebook not found: ${notebookId}`);
  }
  const set = new Set(ids);
  return notes.map((n) =>
    set.has(n.id) ? { ...n, notebookId, updatedAt: nowIso() } : n,
  );
}

/** Add a tag to notes (normalized: trimmed, case-deduped). Throws on blank tag. */
export function tagNotes(notes: Note[], ids: string[], tag: string): Note[] {
  const clean = tag.trim();
  if (clean === '') throw new Error('invalid tag: tag name must not be blank');
  const key = clean.toLowerCase();
  const set = new Set(ids);
  return notes.map((n) => {
    if (!set.has(n.id) || n.tags.some((t) => t.toLowerCase() === key)) return n;
    return { ...n, tags: [...n.tags, clean], updatedAt: nowIso() };
  });
}

/** Set status for notes. Throws on invalid status. */
export function setNotesStatus(notes: Note[], ids: string[], status: NoteStatus): Note[] {
  if (!NOTE_STATUSES.includes(status)) throw new Error(`invalid status: ${status}`);
  const set = new Set(ids);
  return notes.map((n) =>
    set.has(n.id) ? { ...n, status, updatedAt: nowIso() } : n,
  );
}

/** Pin/unpin notes. */
export function setNotesPinned(notes: Note[], ids: string[], pinned: boolean): Note[] {
  const set = new Set(ids);
  return notes.map((n) =>
    set.has(n.id) ? { ...n, pinned, updatedAt: nowIso() } : n,
  );
}
