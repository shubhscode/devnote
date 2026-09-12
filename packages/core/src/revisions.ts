// Revision history (Inkdrop parity: reference/revision-history).
// Snapshots on idle / note-switch / pre-restore; restore is undoable because
// the pre-restore state is snapshotted first. Capped per note + globally.
import { generateId } from './types';
import type { Revision } from './types';

export const REVISIONS_PER_NOTE = 50;
export const REVISIONS_GLOBAL_CAP = 500;

/** True when the note differs from its newest revision (or has none). */
export function shouldSnapshot(revisions: Revision[], noteId: string, title: string, body: string): boolean {
  const latest = revisions
    .filter((r) => r.noteId === noteId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!latest) return title !== '' || body !== '';
  return latest.title !== title || latest.body !== body;
}

/** Append a revision; prune oldest beyond per-note cap, then global cap. */
export function pushRevision(
  revisions: Revision[],
  noteId: string,
  title: string,
  body: string,
  createdAt: string = new Date().toISOString(),
  perNoteCap: number = REVISIONS_PER_NOTE,
  globalCap: number = REVISIONS_GLOBAL_CAP,
): Revision[] {
  const next = [...revisions, { id: generateId(), noteId, title, body, createdAt }];
  const counts = new Map<string, number>();
  // Walk newest-first, keep per-note cap.
  const sorted = [...next].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const keep = new Set<string>();
  for (const r of sorted) {
    const n = counts.get(r.noteId) ?? 0;
    if (n < perNoteCap) {
      keep.add(r.id);
      counts.set(r.noteId, n + 1);
    }
  }
  let pruned = next.filter((r) => keep.has(r.id));
  if (pruned.length > globalCap) {
    const ids = new Set(
      [...pruned]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .slice(0, globalCap)
        .map((r) => r.id),
    );
    pruned = pruned.filter((r) => ids.has(r.id));
  }
  return pruned;
}

/** Newest-first revisions for one note. */
export function revisionsForNote(revisions: Revision[], noteId: string): Revision[] {
  return revisions
    .filter((r) => r.noteId === noteId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}
