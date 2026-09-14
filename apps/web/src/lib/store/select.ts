import {
  descendantIds,
  notebookPath,
  searchNotes,
  sortNotes,
} from '@devnote/core';
import type { Note, Notebook, NoteSortKey, NoteStatus, TreeNode } from '@devnote/core';
import type { SearchScope, Selection } from './types';

/** Direct filter (no ref dependency — used inside computeVisible). */
export function filterBySelectionDirect(
  notes: Note[],
  notebooks: Notebook[],
  selection: Selection,
  expanded: string[],
): Note[] {
  if (selection.kind === 'trash') {
    return notes.filter((n) => n.trashed);
  } else if (selection.kind === 'notebook') {
    const ids = expanded.includes(selection.id)
      ? [selection.id]
      : [selection.id, ...descendantIds(notebooks, selection.id)];
    return notes.filter((n) => !n.trashed && ids.includes(n.notebookId));
  }
  return notes.filter((n) => !n.trashed);
}

export function computeVisible(
  notes: Note[],
  notebooks: Notebook[],
  selection: Selection,
  expanded: string[],
  rawQuery: string,
  _scope: SearchScope = 'global',
  sortKey: NoteSortKey = 'updated',
): Note[] {
  const base = filterBySelectionDirect(notes, notebooks, selection, expanded);
  const q = rawQuery.trim();
  if (q === '') return sortNotes(base, sortKey);
  return searchNotes(base, notebooks, q).map((s) => s.note);
}

/** Notebook ids in the workspace scope (null = no workspace). */
export function workspaceScopeIdsFor(notebooks: Notebook[], workspaceId: string | null): string[] | null {
  if (workspaceId === null) return null;
  if (!notebooks.some((n) => n.id === workspaceId)) return null;
  return [workspaceId, ...descendantIds(notebooks, workspaceId)];
}

/** Sidebar tree scoped to the workspace (full tree when unscoped). */
export function sidebarTreeFor(tree: TreeNode[], workspaceId: string | null, scopeIds: string[] | null): TreeNode[] {
  if (scopeIds === null) return tree;
  const find = (nodes: TreeNode[]): TreeNode | null => {
    for (const n of nodes) {
      if (n.notebook.id === workspaceId) return n;
      const hit = find(n.children);
      if (hit) return hit;
    }
    return null;
  };
  return [find(tree)].filter((n): n is TreeNode => n !== null);
}

/** Status counts over (workspace-scoped) notes, excluding trashed. */
export function statusCountsFor(notes: Note[]): Record<NoteStatus, number> {
  const counts = { none: 0, active: 0, onHold: 0, completed: 0, dropped: 0 } as Record<NoteStatus, number>;
  for (const n of notes) {
    if (!n.trashed) counts[n.status] += 1;
  }
  return counts;
}

/** Tag counts over (workspace-scoped) notes. Case-folded, first-seen casing wins. */
export function tagCountsFor(notes: Note[]): { tag: string; count: number }[] {
  const map = new Map<string, { tag: string; count: number }>();
  for (const n of notes) {
    if (n.trashed) continue;
    for (const t of n.tags) {
      const key = t.trim().toLowerCase();
      if (key === '') continue;
      const entry = map.get(key);
      if (entry) entry.count += 1;
      else map.set(key, { tag: t, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}

/** Note-list header label for the current selection. */
export function labelFor(selection: Selection, notebooks: Notebook[]): string {
  if (selection.kind === 'all') return 'All Notes';
  if (selection.kind === 'trash') return 'Trash';
  return notebookPath(notebooks, selection.id) || 'Notebook';
}

/** Selected ids, falling back to the active note (bulk-action target). */
export function activeOrSelectedIds(selectedIds: string[], activeNoteId: string | null): string[] {
  if (selectedIds.length > 0) return selectedIds;
  return activeNoteId !== null ? [activeNoteId] : [];
}
