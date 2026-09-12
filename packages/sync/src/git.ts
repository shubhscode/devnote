// @devnote/sync — pure git plumbing (no fs, no child_process, no window).
// The Rust adapter (apps/desktop/src-tauri/src/git.rs) shells out to git and
// hands raw output here; parsing + state decisions are unit-tested.
// See PLAN.md Phase 3b.

export type GitFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'ignored'
  | 'conflicted';

export interface GitChange {
  path: string;
  status: GitFileStatus;
}

export interface GitStatus {
  /** Current branch, or null when detached / no commits yet. */
  branch: string | null;
  /** Tracking branch (`origin/main`), or null when none configured. */
  upstream: string | null;
  ahead: number;
  behind: number;
  /** True when the branch has no upstream (`[gone]` or never pushed). */
  upstreamGone: boolean;
  changes: GitChange[];
}

const EMPTY_STATUS: GitStatus = {
  branch: null,
  upstream: null,
  ahead: 0,
  behind: 0,
  upstreamGone: false,
  changes: [],
};

/** Parse `git status --porcelain=v1 --branch` into a structured status. */
export function parsePorcelain(raw: string): GitStatus {
  const status: GitStatus = { ...EMPTY_STATUS, changes: [] };
  for (const line of raw.split('\n')) {
    if (line === '') continue;
    if (line.startsWith('## ')) {
      parseBranch(line.slice(3), status);
      continue;
    }
    if (line.length < 3) continue;
    const xy = line.slice(0, 2);
    // Renames read `R  old -> new`; keep the destination path.
    const rest = line.slice(3);
    const arrow = rest.lastIndexOf(' -> ');
    const path = arrow >= 0 ? rest.slice(arrow + 4) : rest;
    status.changes.push({ path: unquote(path), status: classifyXY(xy) });
  }
  return status;
}

function parseBranch(rest: string, status: GitStatus): void {
  if (rest.startsWith('No commits yet on ')) {
    status.branch = rest.slice('No commits yet on '.length).trim();
    return;
  }
  if (rest.startsWith('Initial commit on ')) {
    status.branch = rest.slice('Initial commit on '.length).trim();
    return;
  }
  if (rest.startsWith('HEAD (no branch)')) return;
  const [local = '', tail = ''] = rest.split('...');
  status.branch = local.trim() === '' ? null : local.trim();
  const bracket = /\[(.*)\]/.exec(tail);
  if (bracket) {
    const body = bracket[1] ?? '';
    status.upstreamGone = body.includes('gone');
    status.ahead = Number(/ahead (\d+)/.exec(body)?.[1] ?? 0);
    status.behind = Number(/behind (\d+)/.exec(body)?.[1] ?? 0);
  }
  const upstream = tail.replace(/\s*\[.*\]\s*/, '').trim();
  status.upstream = upstream === '' ? null : upstream;
}

function unquote(path: string): string {
  return path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1).replace(/\\"/g, '"') : path;
}

function classifyXY(xy: string): GitFileStatus {
  if (xy === '??') return 'untracked';
  if (xy === '!!') return 'ignored';
  const x = xy[0] ?? ' ';
  const y = xy[1] ?? ' ';
  if (x === 'U' || y === 'U' || xy === 'AA' || xy === 'DD') return 'conflicted';
  if (x === 'R' || y === 'R') return 'renamed';
  if (x === 'D' || y === 'D') return 'deleted';
  if (x === 'A' || y === 'A') return 'added';
  return 'modified';
}

export type SyncState =
  | 'no-git'
  | 'no-repo'
  | 'clean'
  | 'dirty'
  | 'ahead'
  | 'behind'
  | 'diverged'
  | 'conflict';

export interface SyncStateInput {
  hasGit: boolean;
  hasRepo: boolean;
  status: GitStatus;
}

/**
 * Reduce raw status to one UI state. Precedence: conflict > diverged > dirty >
 * ahead > behind > clean. Unknown/ignored entries don't mark the tree dirty.
 */
export function classifySyncState(input: SyncStateInput): SyncState {
  if (!input.hasGit) return 'no-git';
  if (!input.hasRepo) return 'no-repo';
  const s = input.status;
  if (s.changes.some((c) => c.status === 'conflicted')) return 'conflict';
  if (s.ahead > 0 && s.behind > 0) return 'diverged';
  if (s.changes.some((c) => c.status !== 'ignored')) return 'dirty';
  if (s.ahead > 0) return 'ahead';
  if (s.behind > 0) return 'behind';
  return 'clean';
}

export const SYNC_STATE_LABEL: Record<SyncState, string> = {
  'no-git': 'Git not installed',
  'no-repo': 'No sync repo',
  clean: 'Synced',
  dirty: 'Uncommitted changes',
  ahead: 'Unpushed commits',
  behind: 'Updates available',
  diverged: 'Branches diverged',
  conflict: 'Conflict needs review',
};

/** Paths needing manual conflict resolution. */
export function conflictedPaths(status: GitStatus): string[] {
  return status.changes.filter((c) => c.status === 'conflicted').map((c) => c.path);
}

/** Default commit subject for the app's own auto-commits. */
export function syncCommitMessage(when: string, device: string): string {
  return `devnote: sync ${when} (${device})`;
}
