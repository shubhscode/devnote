// @devnote/core — domain types. See AGENTS.md §6, PLAN.md §2.

export type NoteStatus = 'none' | 'active' | 'onHold' | 'completed' | 'dropped';

export const NOTE_STATUSES: NoteStatus[] = ['none', 'active', 'onHold', 'completed', 'dropped'];

export interface Notebook {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  notebookId: string;
  tags: string[];
  status: NoteStatus;
  pinned: boolean;
  trashed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Revision {
  id: string;
  noteId: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface Template {
  id: string;
  name: string;
  body: string;
  /** Built-ins are read-only; editing one saves a custom copy (Inkdrop parity). */
  builtin?: boolean;
  category?: string;
  description?: string;
}

export interface TreeNode {
  notebook: Notebook;
  children: TreeNode[];
}

/** ID + timestamp helpers (crypto.randomUUID, zero deps). */
export function generateId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
