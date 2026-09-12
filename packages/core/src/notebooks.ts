// Notebook tree + CRUD ops. Pure functions — no IO. See PLAN.md §2/§5 (#2).
import { generateId, nowIso } from './types';
import type { Notebook, Note, TreeNode } from './types';

/** Build a nested notebook tree. Throws on orphans/cycles. */
export function buildNotebookTree(notebooks: Notebook[]): TreeNode[] {
  const byId = new Map(notebooks.map((n) => [n.id, n]));
  for (const n of notebooks) {
    if (n.parentId !== null && !byId.has(n.parentId)) {
      throw new Error(`orphan notebook ${n.id} -> missing parent ${n.parentId}`);
    }
  }
  const childrenOf = new Map<string | null, Notebook[]>();
  for (const n of notebooks) {
    const list = childrenOf.get(n.parentId) ?? [];
    list.push(n);
    childrenOf.set(n.parentId, list);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }
  const visited = new Set<string>();
  function dfs(id: string, stack: string[]): void {
    if (stack.includes(id)) throw new Error(`cycle detected: ${[...stack, id].join(' -> ')}`);
    if (visited.has(id)) return;
    for (const child of childrenOf.get(id) ?? []) dfs(child.id, [...stack, id]);
    visited.add(id);
  }
  for (const n of notebooks) dfs(n.id, []);
  function toNodes(parentId: string | null): TreeNode[] {
    return (childrenOf.get(parentId) ?? []).map((n) => ({
      notebook: n,
      children: toNodes(n.id),
    }));
  }
  return toNodes(null);
}

/** All descendant ids of a notebook (excluding itself). */
export function descendantIds(notebooks: Notebook[], id: string): string[] {
  const out: string[] = [];
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const n of notebooks) {
      if (n.parentId === current) {
        out.push(n.id);
        queue.push(n.id);
      }
    }
  }
  return out;
}

/** Display path like `Projects / devnote`. */
export function notebookPath(notebooks: Notebook[], id: string): string {
  const byId = new Map(notebooks.map((n) => [n.id, n]));
  const parts: string[] = [];
  let current = byId.get(id);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    parts.unshift(current.name);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return parts.join(' / ');
}

/** Direct (non-trashed) note count per notebook id. */
export function countDirectNotes(notes: Note[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of notes) {
    if (n.trashed) continue;
    counts.set(n.notebookId, (counts.get(n.notebookId) ?? 0) + 1);
  }
  return counts;
}

export function createNotebook(
  notebooks: Notebook[],
  input: { name: string; parentId?: string | null },
): Notebook[] {
  const name = input.name.trim();
  if (name === '') throw new Error('notebook name must not be empty');
  const parentId = input.parentId ?? null;
  if (parentId !== null && !notebooks.some((n) => n.id === parentId)) {
    throw new Error(`parent notebook not found: ${parentId}`);
  }
  const siblings = notebooks.filter((n) => n.parentId === parentId);
  const sortOrder = siblings.reduce((max, n) => Math.max(max, n.sortOrder), -1) + 1;
  const now = nowIso();
  const notebook: Notebook = {
    id: generateId(),
    name,
    parentId,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
  return [...notebooks, notebook];
}

export function renameNotebook(notebooks: Notebook[], id: string, name: string): Notebook[] {
  const next = name.trim();
  if (next === '') throw new Error('notebook name must not be empty');
  if (!notebooks.some((n) => n.id === id)) throw new Error(`notebook not found: ${id}`);
  return notebooks.map((n) =>
    n.id === id ? { ...n, name: next, updatedAt: nowIso() } : n,
  );
}

export function moveNotebook(
  notebooks: Notebook[],
  id: string,
  newParentId: string | null,
): Notebook[] {
  const node = notebooks.find((n) => n.id === id);
  if (!node) throw new Error(`notebook not found: ${id}`);
  if (newParentId === id) throw new Error('cannot move a notebook into itself');
  if (newParentId !== null) {
    if (!notebooks.some((n) => n.id === newParentId)) {
      throw new Error(`parent notebook not found: ${newParentId}`);
    }
    if (descendantIds(notebooks, id).includes(newParentId)) {
      throw new Error('cannot move a notebook into its own descendant');
    }
  }
  return notebooks.map((n) =>
    n.id === id ? { ...n, parentId: newParentId, updatedAt: nowIso() } : n,
  );
}

/**
 * Delete a notebook. Only allowed when it has no sub-notebooks and no
 * non-trashed notes — caller must trash/move contents first (Inkdrop parity:
 * no silent data loss).
 */
export function deleteNotebook(
  notebooks: Notebook[],
  notes: Note[],
  id: string,
): Notebook[] {
  if (notebooks.some((n) => n.parentId === id)) {
    throw new Error('notebook has sub-notebooks — move or delete them first');
  }
  if (notes.some((n) => n.notebookId === id && !n.trashed)) {
    throw new Error('notebook has notes — move or trash them first');
  }
  if (!notebooks.some((n) => n.id === id)) throw new Error(`notebook not found: ${id}`);
  return notebooks.filter((n) => n.id !== id);
}
