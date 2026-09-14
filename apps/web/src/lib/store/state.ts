import type { SetStateAction } from 'react';
import { create } from 'zustand';
import {
  createNote,
  createNotebook,
  deleteNotebook,
  deleteNotesPermanently,
  duplicateNote,
  mergeTags as mergeTagNotes,
  moveNotes as moveNotesCore,
  noteFilename,
  noteToMarkdown,
  renameNotebook,
  renameTag as renameTagNotes,
  reorderNotebook as reorderNotebookCore,
  restoreNotes,
  setNotesPinned,
  setNotesStatus,
  tagNotes as tagNotesCore,
  trashNotes,
  untagNotes,
  updateNote,
} from '@devnote/core';
import type { Note, Notebook, NoteStatus, StorageAdapter, Template, Revision } from '@devnote/core';
import type { SyncState } from '@devnote/sync';
import { localStorageAdapter } from '../storage';
import { loadPersisted } from './persist';
import { computeVisible } from './select';
import type { SearchScope, Selection, Settings } from './types';

/** Full store shape. Slices migrate here one at a time (Track 1.1); the
 *  `useDevnoteStore` hook keeps owning whatever hasn't moved yet. */
export interface DevnoteState {
  // Data slice
  notebooks: Notebook[];
  notes: Note[];
  // UI slice
  selection: Selection;
  activeNoteId: string | null;
  selectedIds: string[];
  query: string;
  scope: SearchScope;
  workspaceId: string | null;
  expanded: string[];
  past: string[];
  future: string[];
  notice: string | null;
  // Library slice
  customTemplates: Template[];
  templateRecents: string[];
  revisions: Revision[];
  settings: Settings;
  // Transient
  externalBodyWrite: { noteId: string; body: string; seq: number } | null;
  // Sync slice
  mirrorDir: string | null;
  syncState: SyncState;
  syncDevice: string;
  remoteUrl: string | null;
  syncBusy: boolean;
  /** Keys whose stored payload was corrupt (quarantined on load). */
  corruptedKeys: string[];
}

export type DevnoteStoreApi = ReturnType<typeof createDevnoteStore>;

export interface NotePatch {
  title?: string;
  body?: string;
  tags?: string[];
  status?: NoteStatus;
  pinned?: boolean;
  notebookId?: string;
}

/** Notes/notebooks/tags actions. Stable identities — they read via `get()`,
 *  so the stale-closure refs (`live`, `activeIdRef`) are unnecessary. */
export interface DataActions {
  newNote: () => void;
  commitPatch: (id: string, patch: NotePatch) => void;
  duplicate: (ids: string[]) => void;
  trash: (ids: string[]) => void;
  restore: (ids: string[], targetNotebookId: string) => void;
  destroy: (ids: string[]) => void;
  selectRange: (id: string) => void;
  moveNotesTo: (ids: string[], notebookId: string) => void;
  bulkTag: (ids: string[], tag: string) => void;
  bulkStatus: (ids: string[], status: NoteStatus) => void;
  bulkPin: (ids: string[], pinned: boolean) => void;
  exportNotes: (ids: string[]) => void;
  reorderNotebook: (id: string, dir: -1 | 1) => void;
  addNotebook: (parentId: string | null) => string | null;
  rename: (id: string, name: string) => void;
  renameTag: (oldName: string, newName: string) => void;
  mergeTags: (from: string[], into: string) => void;
  deleteTag: (name: string) => void;
  removeNotebook: (id: string) => void;
  toggleExpand: (id: string) => void;
  toggleScope: () => void;
}

/** Last-keystroke timestamp for the idle revision snapshot. Module-level:
 *  hot path, never rendered. */
export const editClock = { lastEditAt: 0 };

function defaultNotebookIdFor(notebooks: Notebook[], settings: Settings): string | null {
  if (settings.defaultNotebookId !== null && notebooks.some((n) => n.id === settings.defaultNotebookId)) {
    return settings.defaultNotebookId;
  }
  const roots = notebooks.filter((n) => n.parentId === null);
  return roots[0]?.id ?? notebooks[0]?.id ?? null;
}

export function createDevnoteStore(adapter: StorageAdapter = localStorageAdapter) {
  const initial = loadPersisted(adapter);
  return create<DevnoteState & DataActions>()((set, get) => {
    const fail = (e: unknown) => {
      set({ notice: e instanceof Error ? e.message : 'Something went wrong' });
    };
    return {
      notebooks: initial.notebooks,
      notes: initial.notes,
      selection: { kind: 'all' },
      activeNoteId: initial.notes[0]?.id ?? null,
      selectedIds: [],
      query: '',
      scope: 'local',
      workspaceId: null,
      expanded: [],
      past: [],
      future: [],
      notice: null,
      customTemplates: initial.customTemplates,
      templateRecents: initial.templateRecents,
      revisions: initial.revisions,
      settings: initial.settings,
      externalBodyWrite: null,
      mirrorDir: null,
      syncState: 'no-repo',
      syncDevice: 'device',
      remoteUrl: null,
      syncBusy: false,
      corruptedKeys: initial.corruptedKeys,

      newNote: () => {
        const { notes, notebooks, selection, settings } = get();
        const target = selection.kind === 'notebook' ? selection.id : defaultNotebookIdFor(notebooks, settings);
        if (target === null) {
          set({ notice: 'Create a notebook first' });
          return;
        }
        try {
          const { notes: next, note } = createNote(notes, notebooks, { notebookId: target });
          set({ notes: next, selectedIds: [note.id], activeNoteId: note.id });
        } catch (e) {
          fail(e);
        }
      },

      commitPatch: (id, patch) => {
        try {
          set((s) => ({ notes: updateNote(s.notes, s.notebooks, id, patch) }));
          editClock.lastEditAt = Date.now();
        } catch (e) {
          fail(e);
        }
      },

      duplicate: (ids) => {
        try {
          let next = get().notes;
          let first: Note | null = null;
          for (const id of ids) {
            const r = duplicateNote(next, id);
            next = r.notes;
            first ??= r.note;
          }
          set({ notes: next });
          if (first) set({ selectedIds: [first.id], activeNoteId: first.id });
        } catch (e) {
          fail(e);
        }
      },

      trash: (ids) => {
        set((s) => ({
          notes: trashNotes(s.notes, ids),
          selectedIds: [],
          activeNoteId: s.activeNoteId !== null && ids.includes(s.activeNoteId) ? null : s.activeNoteId,
        }));
      },

      restore: (ids, targetNotebookId) => {
        try {
          set((s) => ({
            notes: restoreNotes(s.notes, s.notebooks, ids, targetNotebookId),
            selectedIds: [],
          }));
        } catch (e) {
          fail(e);
        }
      },

      destroy: (ids) => {
        try {
          set((s) => ({
            notes: deleteNotesPermanently(s.notes, ids),
            selectedIds: [],
            activeNoteId: s.activeNoteId !== null && ids.includes(s.activeNoteId) ? null : s.activeNoteId,
          }));
        } catch (e) {
          fail(e);
        }
      },

      /** Shift-click range: anchor = last selected (else active), union over visible order. */
      selectRange: (id) => {
        const s = get();
        const order = computeVisible(s.notes, s.notebooks, s.selection, s.expanded, s.query, s.scope, s.settings.noteSort).map((n) => n.id);
        if (!order.includes(id)) return;
        const anchor = s.selectedIds.length > 0 ? s.selectedIds[s.selectedIds.length - 1]! : s.activeNoteId;
        if (anchor === null || !order.includes(anchor)) {
          set({ selectedIds: [id], activeNoteId: id });
        } else {
          const [a, b] = [order.indexOf(anchor), order.indexOf(id)].sort((x, y) => x - y) as [number, number];
          const range = order.slice(a, b + 1);
          set((prev) => ({ selectedIds: [...new Set([...prev.selectedIds, ...range])], activeNoteId: id }));
        }
      },

      moveNotesTo: (ids, notebookId) => {
        try {
          set((s) => ({ notes: moveNotesCore(s.notes, s.notebooks, ids, notebookId) }));
        } catch (e) {
          fail(e);
        }
      },

      bulkTag: (ids, tag) => {
        try {
          set((s) => ({ notes: tagNotesCore(s.notes, ids, tag) }));
        } catch (e) {
          fail(e);
        }
      },

      bulkStatus: (ids, status) => {
        try {
          set((s) => ({ notes: setNotesStatus(s.notes, ids, status) }));
        } catch (e) {
          fail(e);
        }
      },

      bulkPin: (ids, pinned) => {
        try {
          set((s) => ({ notes: setNotesPinned(s.notes, ids, pinned) }));
        } catch (e) {
          fail(e);
        }
      },

      /** Download selected notes as individual Markdown files (reimportable via mirror). */
      exportNotes: (ids) => {
        try {
          const { notes, notebooks } = get();
          const setIds = new Set(ids);
          const targets = notes.filter((n) => setIds.has(n.id));
          if (targets.length === 0) {
            set({ notice: 'Nothing selected' });
            return;
          }
          targets.forEach((note, i) => {
            const blob = new Blob([noteToMarkdown(note, notebooks)], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = noteFilename(note);
            document.body.appendChild(a);
            window.setTimeout(() => {
              a.click();
              document.body.removeChild(a);
              window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            }, i * 150);
          });
          set({ notice: `Exported ${targets.length} note${targets.length === 1 ? '' : 's'} as Markdown` });
        } catch (e) {
          fail(e);
        }
      },

      reorderNotebook: (id, dir) => {
        try {
          set((s) => ({ notebooks: reorderNotebookCore(s.notebooks, id, dir) }));
        } catch (e) {
          fail(e);
        }
      },

      addNotebook: (parentId) => {
        try {
          const next = createNotebook(get().notebooks, { name: 'Untitled notebook', parentId });
          set({ notebooks: next });
          return next[next.length - 1]?.id ?? null;
        } catch (e) {
          fail(e);
          return null;
        }
      },

      rename: (id, name) => {
        try {
          set((s) => ({ notebooks: renameNotebook(s.notebooks, id, name) }));
        } catch (e) {
          fail(e);
        }
      },

      renameTag: (oldName, newName) => {
        try {
          const q = get().query;
          set((s) => ({ notes: renameTagNotes(s.notes, oldName, newName) }));
          if (q.trim().toLowerCase() === `tag:${oldName.trim().toLowerCase()}`) {
            set({ query: `tag:${newName.trim()}` });
          }
        } catch (e) {
          fail(e);
        }
      },

      mergeTags: (from, into) => {
        try {
          set((s) => ({ notes: mergeTagNotes(s.notes, from, into) }));
        } catch (e) {
          fail(e);
        }
      },

      deleteTag: (name) => {
        try {
          set((s) => ({ notes: untagNotes(s.notes, name) }));
        } catch (e) {
          fail(e);
        }
      },

      removeNotebook: (id) => {
        try {
          set((s) => ({
            notebooks: deleteNotebook(s.notebooks, s.notes, id),
            selection: s.selection.kind === 'notebook' && s.selection.id === id ? { kind: 'all' } : s.selection,
          }));
        } catch (e) {
          fail(e);
        }
      },

      toggleExpand: (id) => {
        set((s) => ({ expanded: s.expanded.includes(id) ? s.expanded.filter((x) => x !== id) : [...s.expanded, id] }));
      },

      toggleScope: () => {
        set((s) => ({ scope: s.scope === 'local' ? 'global' : 'local' }));
      },
    };
  });
}

let singleton: DevnoteStoreApi | null = null;

/** Default singleton (what `App` uses); custom adapters get their own store (tests). */
export function getDevnoteStore(adapter: StorageAdapter = localStorageAdapter): DevnoteStoreApi {
  if (adapter === localStorageAdapter) {
    singleton ??= createDevnoteStore(adapter);
    return singleton;
  }
  return createDevnoteStore(adapter);
}

/** Route a React-style `setState` (value or updater) into the zustand store. */
export function setStoreState<T>(api: DevnoteStoreApi, key: keyof DevnoteState, update: SetStateAction<T>) {
  api.setState((s) => ({
    [key]: typeof update === 'function' ? (update as (prev: T) => T)(s[key] as T) : update,
  }) as Partial<DevnoteState>);
}
