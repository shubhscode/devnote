// @devnote/sync — conflict resolution (per-file, never silently drop text).
// Winner = newer frontmatter `updatedAt` (tie → local). Loser is preserved as
// `<stem>.conflict-<device>.md` with a fresh id + "(conflict <device>)" title so
// it re-imports as a reviewable note instead of being pruned as a stale path.
// See PLAN.md Phase 3b.
import { fileUpdatedAt, generateId, readFrontmatter, writeFrontmatter } from '@devnote/core';

export interface ConflictResolution {
  /** Winning content written back to the original path. */
  resolved: string;
  /** Loser content as a new conflict note, or null when identical. */
  conflict: { path: string; content: string } | null;
  winner: 'ours' | 'theirs';
}

/** Filesystem-safe device tag for conflict filenames. */
export function sanitizeDevice(device: string): string {
  const cleaned = device
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned === '' ? 'device' : cleaned;
}

/** `Notes/foo-abc12345.md` → `Notes/foo-abc12345.conflict-<device>.md`. */
export function conflictPath(path: string, device: string): string {
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash + 1) : '';
  const file = slash >= 0 ? path.slice(slash + 1) : path;
  const stem = file.replace(/\.md$/i, '');
  return `${dir}${stem}.conflict-${sanitizeDevice(device)}.md`;
}

/**
 * Pick a winner by frontmatter `updatedAt` and build a preserved loser note.
 * `ours` is the local file (stage 2), `theirs` the incoming one (stage 3).
 */
export function resolveConflict(
  ours: string,
  theirs: string,
  path: string,
  device: string,
  now: string,
): ConflictResolution {
  const oursAt = fileUpdatedAt(ours) ?? '';
  const theirsAt = fileUpdatedAt(theirs) ?? '';
  const winner: 'ours' | 'theirs' = theirsAt !== '' && theirsAt > oursAt ? 'theirs' : 'ours';
  const resolved = winner === 'ours' ? ours : theirs;
  const loser = winner === 'ours' ? theirs : ours;

  if (loser === resolved) return { resolved, conflict: null, winner };

  const { data, body } = readFrontmatter(loser);
  const baseTitle = typeof data.title === 'string' && data.title.trim() !== '' ? data.title : '';
  const title = `${baseTitle === '' ? 'Untitled' : baseTitle} (conflict ${sanitizeDevice(device)})`;
  const preserved = writeFrontmatter(
    { ...data, id: generateId(), title, updatedAt: now },
    body,
  );
  return { resolved, conflict: { path: conflictPath(path, device), content: preserved }, winner };
}
