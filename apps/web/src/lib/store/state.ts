import type { SetStateAction } from 'react';
import { create } from 'zustand';
import {
  BUILTIN_TEMPLATES,
  applyTemplate,
  createCustomTemplate,
  createNote,
  createNotebook,
  deleteCustomTemplate,
  deleteNotebook,
  deleteNotesPermanently,
  descendantIds,
  duplicateAsCustom,
  duplicateNote,
  markTemplateUsed,
  mergeTags as mergeTagNotes,
  moveNotes as moveNotesCore,
  noteFilename,
  noteToMarkdown,
  parseTemplateBody,
  planExport,
  planImport,
  pushRevision,
  renameNotebook,
  renameTag as renameTagNotes,
  reorderNotebook as reorderNotebookCore,
  restoreNotes,
  setNotesPinned,
  setNotesStatus,
  shouldSnapshot,
  tagNotes as tagNotesCore,
  trashNotes,
  untagNotes,
  updateCustomTemplate,
  updateNote,
} from '@devnote/core';
import type { Note, Notebook, NoteStatus, StorageAdapter, Template, Revision } from '@devnote/core';
import type { SyncState } from '@devnote/sync';
import {
  classifySyncState,
  conflictedPaths,
  parsePorcelain,
  resolveConflict,
  syncCommitMessage,
} from '@devnote/sync';
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

/** Complete store shape (state + all action groups). */
export type FullStoreState = DevnoteState & DataActions & NavActions & RevActions & LibraryActions & SyncActions & PatchAction;

/** Escape hatch for plain value sets (search box, selection lists, notices). */
export interface PatchAction {
  patch: (p: Partial<DevnoteState>) => void;
}

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

/** Navigation + history actions. */
export interface NavActions {
  navigateTo: (id: string | null) => void;
  goBack: () => void;
  goForward: () => void;
  openNote: (id: string, modClick: boolean) => void;
  select: (s: Selection) => void;
  focusWorkspace: (id: string) => void;
  clearWorkspace: () => void;
  toggleWorkspace: () => void;
  /** Set the search query, resetting to All Notes (or the workspace root) first. */
  pickQuery: (q: string) => void;
}

/** Revision snapshot/restore actions. */
export interface RevActions {
  snapshotNote: (noteId: string) => void;
  snapshotIdle: () => void;
  restoreRevision: (noteId: string, revisionId: string) => void;
}

export interface TemplateInput {
  name: string;
  body: string;
  description?: string;
}

/** Templates + settings actions. */
export interface LibraryActions {
  createTemplate: (input: TemplateInput) => string | null;
  updateTemplate: (id: string, patch: { name?: string; body?: string; description?: string }) => void;
  deleteTemplate: (id: string) => void;
  duplicateTemplate: (id: string) => string | null;
  applyTemplateToNote: (templateId: string) => string | null;
  updateSettings: (patch: Partial<Settings>) => void;
}

/** File mirror + git sync actions (desktop only; no-ops in browser). */
export interface SyncActions {
  exportMirror: () => Promise<void>;
  importMirror: () => Promise<void>;
  refreshSyncState: () => Promise<void>;
  syncNow: () => Promise<void>;
}

/** Last-keystroke timestamp for the idle revision snapshot. Module-level:
 *  hot path, never rendered. */
export const editClock = { lastEditAt: 0 };

/** Same-tick snapshot dedupe (was `lastSnap` ref). */
const snapDedupe: { current: { id: string; title: string; body: string } | null } = { current: null };

/** Sequence for external body writes (template apply, revision restore). */
export const externalWriteSeq = { current: 0 };

const IDLE_SNAPSHOT_MS = 30_000;

function defaultNotebookIdFor(notebooks: Notebook[], settings: Settings): string | null {
  if (settings.defaultNotebookId !== null && notebooks.some((n) => n.id === settings.defaultNotebookId)) {
    return settings.defaultNotebookId;
  }
  const roots = notebooks.filter((n) => n.parentId === null);
  return roots[0]?.id ?? notebooks[0]?.id ?? null;
}

export function createDevnoteStore(adapter: StorageAdapter = localStorageAdapter) {
  const initial = loadPersisted(adapter);
  return create<DevnoteState & DataActions & NavActions & RevActions & LibraryActions & SyncActions & PatchAction>()((set, get) => {
    const fail = (e: unknown) => {
      set({ notice: e instanceof Error ? e.message : 'Something went wrong' });
    };
    const snapshotNote = (noteId: string) => {
      const { notes: ns, revisions: rs } = get();
      const n = ns.find((x) => x.id === noteId);
      if (!n || n.trashed) return;
      const key = { id: noteId, title: n.title, body: n.body };
      const last = snapDedupe.current;
      if (last && last.id === key.id && last.title === key.title && last.body === key.body) return;
      if (!shouldSnapshot(rs, noteId, n.title, n.body)) {
        snapDedupe.current = key;
        return;
      }
      snapDedupe.current = key;
      set((s) => ({ revisions: pushRevision(s.revisions, noteId, n.title, n.body) }));
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

      patch: (p) => {
        set(p);
      },

      snapshotNote,

      /** Idle trigger (called on an interval): snapshot the active note after 30s quiet. */
      snapshotIdle: () => {
        const id = get().activeNoteId;
        if (id === null) return;
        if (Date.now() - editClock.lastEditAt < IDLE_SNAPSHOT_MS) return;
        snapshotNote(id);
      },

      /** Restore a revision. Pre-restore state is snapshotted first, so restores are undoable. */
      restoreRevision: (noteId, revisionId) => {
        const rev = get().revisions.find((r) => r.id === revisionId && r.noteId === noteId);
        if (!rev) {
          set({ notice: 'Revision not found' });
          return;
        }
        snapshotNote(noteId);
        try {
          set((s) => ({ notes: updateNote(s.notes, s.notebooks, noteId, { title: rev.title, body: rev.body }) }));
        } catch (e) {
          fail(e);
          return;
        }
        externalWriteSeq.current += 1;
        set({
          externalBodyWrite: { noteId, body: rev.body, seq: externalWriteSeq.current },
          notice: 'Revision restored — previous version kept in history',
        });
      },

      navigateTo: (id) => {
        const prev = get().activeNoteId;
        if (prev !== null && prev !== id) {
          snapshotNote(prev);
          set((s) => ({ past: [...s.past.slice(-49), prev], future: [] }));
        }
        set({ activeNoteId: id });
      },

      goBack: () => {
        const cur = get().activeNoteId;
        if (cur !== null) snapshotNote(cur);
        const past = get().past;
        if (past.length === 0) return;
        const prev = past[past.length - 1];
        set((s) => ({
          past: s.past.slice(0, -1),
          activeNoteId: prev ?? s.activeNoteId,
          future: s.activeNoteId !== null && prev !== undefined ? [s.activeNoteId, ...s.future] : s.future,
        }));
      },

      goForward: () => {
        const cur = get().activeNoteId;
        if (cur !== null) snapshotNote(cur);
        const future = get().future;
        if (future.length === 0) return;
        const [next, ...rest] = future;
        set((s) => ({
          future: rest,
          activeNoteId: next ?? s.activeNoteId,
          past: s.activeNoteId !== null && next !== undefined ? [...s.past.slice(-49), s.activeNoteId] : s.past,
        }));
      },

      openNote: (id, modClick) => {
        const cur = get().activeNoteId;
        if (cur !== null && cur !== id) snapshotNote(cur);
        if (modClick) {
          set((s) => ({
            selectedIds: s.selectedIds.includes(id) ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id],
            activeNoteId: id,
          }));
        } else {
          set({ selectedIds: [id] });
          get().navigateTo(id);
        }
      },

      select: (sel) => {
        const cur = get().activeNoteId;
        if (cur !== null) snapshotNote(cur);
        const { notebooks, workspaceId, notes, expanded, settings } = get();
        // Leaving the workspace clears it — navigating inside keeps it.
        if (sel.kind !== 'notebook' || workspaceId === null || (sel.id !== workspaceId && !descendantIds(notebooks, workspaceId).includes(sel.id))) {
          set({ workspaceId: null });
        }
        const first = computeVisible(notes, notebooks, sel, expanded, '', 'local', settings.noteSort)[0]?.id ?? null;
        set({ selection: sel, selectedIds: [], query: '', scope: 'local', activeNoteId: first, past: [], future: [] });
      },

      /** Focus a notebook as workspace: sidebar scopes to its subtree. */
      focusWorkspace: (id) => {
        const { notebooks, notes, expanded, settings } = get();
        if (!notebooks.some((n) => n.id === id)) {
          set({ notice: 'Notebook not found' });
          return;
        }
        const cur = get().activeNoteId;
        if (cur !== null) snapshotNote(cur);
        const sel: Selection = { kind: 'notebook', id };
        const first = computeVisible(notes, notebooks, sel, expanded, '', 'local', settings.noteSort)[0]?.id ?? null;
        set({ workspaceId: id, selection: sel, selectedIds: [], query: '', scope: 'local', activeNoteId: first, past: [], future: [] });
      },

      clearWorkspace: () => {
        set({ workspaceId: null });
      },

      /** Set the search query, resetting to All Notes (or the workspace root) first. */
      pickQuery: (q) => {
        const { workspaceId, selection } = get();
        if (workspaceId !== null) {
          // Stay in the workspace: filter its notebook locally.
          get().focusWorkspace(workspaceId);
        } else if (selection.kind !== 'all') {
          get().select({ kind: 'all' });
        }
        set({ query: q });
      },

      /** Toggle workspace for the selected notebook (else the active note's). */
      toggleWorkspace: () => {
        const { workspaceId, selection, notes, activeNoteId } = get();
        if (workspaceId !== null) {
          set({ workspaceId: null });
          return;
        }
        const id = selection.kind === 'notebook'
          ? selection.id
          : notes.find((n) => n.id === activeNoteId && !n.trashed)?.notebookId ?? null;
        if (id === null) {
          set({ notice: 'Select a notebook first' });
          return;
        }
        get().focusWorkspace(id);
      },

      createTemplate: (input) => {
        try {
          const next = createCustomTemplate(get().customTemplates, input);
          set({ customTemplates: next });
          return next[next.length - 1]?.id ?? null;
        } catch (e) {
          fail(e);
          return null;
        }
      },

      updateTemplate: (id, patch) => {
        try {
          set((s) => ({ customTemplates: updateCustomTemplate(s.customTemplates, [...s.customTemplates, ...BUILTIN_TEMPLATES], id, patch) }));
        } catch (e) {
          fail(e);
        }
      },

      deleteTemplate: (id) => {
        try {
          set((s) => ({
            customTemplates: deleteCustomTemplate(s.customTemplates, [...s.customTemplates, ...BUILTIN_TEMPLATES], id),
            templateRecents: s.templateRecents.filter((x) => x !== id),
          }));
        } catch (e) {
          fail(e);
        }
      },

      duplicateTemplate: (id) => {
        try {
          const customs = get().customTemplates;
          const r = duplicateAsCustom(customs, [...customs, ...BUILTIN_TEMPLATES], id);
          set({ customTemplates: r.customs });
          return r.template.id;
        } catch (e) {
          fail(e);
          return null;
        }
      },

      /**
       * Apply a template: fills the active note in place when it's still empty,
       * otherwise creates a fresh note (template `notebook` wins, then current
       * notebook, then default). Returns the target note id.
       */
      applyTemplateToNote: (templateId) => {
        const { customTemplates, notes, notebooks, activeNoteId, selection, settings } = get();
        const all = [...customTemplates, ...BUILTIN_TEMPLATES];
        const tpl = all.find((t) => t.id === templateId);
        if (!tpl) {
          set({ notice: 'Template not found' });
          return null;
        }
        const now = new Date();
        const current = notes.find((n) => n.id === activeNoteId) ?? null;
        set((s) => ({ templateRecents: markTemplateUsed(s.templateRecents, templateId) }));
        if (current !== null && !current.trashed && current.title.trim() === '' && current.body.trim() === '') {
          const applied = applyTemplate(tpl, { title: '', tags: current.tags, status: current.status }, now);
          get().snapshotNote(current.id); // in-place fill is a content change — keep history
          try {
            set((s) => ({
              notes: updateNote(s.notes, s.notebooks, current.id, {
                title: applied.title, body: applied.body, tags: applied.tags, status: applied.status,
              }),
            }));
          } catch (e) {
            fail(e);
            return null;
          }
          externalWriteSeq.current += 1;
          set({ externalBodyWrite: { noteId: current.id, body: applied.body, seq: externalWriteSeq.current } });
          return current.id;
        }
        const { config } = parseTemplateBody(tpl.body);
        let target = defaultNotebookIdFor(notebooks, settings);
        if (config.notebook) {
          const found = notebooks.find((n) => n.name.toLowerCase() === config.notebook!.toLowerCase());
          if (found) target = found.id;
        } else if (selection.kind === 'notebook') {
          target = selection.id;
        }
        if (target === null) {
          set({ notice: 'Create a notebook first' });
          return null;
        }
        try {
          const created = createNote(notes, notebooks, { notebookId: target });
          const applied = applyTemplate(tpl, { title: '', tags: [], status: 'none' }, now);
          set({
            notes: updateNote(created.notes, notebooks, created.note.id, {
              title: applied.title, body: applied.body, tags: applied.tags, status: applied.status,
            }),
            selectedIds: [created.note.id],
            activeNoteId: created.note.id,
          });
          return created.note.id;
        } catch (e) {
          fail(e);
          return null;
        }
      },

      updateSettings: (patch) => {
        set((s) => ({
          settings: {
            ...s.settings,
            ...patch,
            ...(patch.fontSize !== undefined
              ? { fontSize: Math.min(18, Math.max(11, patch.fontSize)) }
              : {}),
          },
        }));
      },

      /** Write all notes to ~/devnote, pruning moved/deleted files. */
      exportMirror: async () => {
        try {
          const { mirrorReadFiles, mirrorSync, mirrorRootPath } = await import('../mirror');
          const { notes, notebooks } = get();
          const files = await mirrorReadFiles();
          const plan = planExport(notes, notebooks, files);
          await mirrorSync(plan.writes, plan.deletes);
          set({
            mirrorDir: await mirrorRootPath(),
            notice: `Mirror updated: ${plan.writes.length} written, ${plan.deletes.length} removed, ${plan.skipped} unchanged`,
          });
        } catch (e) {
          fail(e);
        }
      },

      /** Read ~/devnote into notes (newer-updatedAt wins, never deletes). */
      importMirror: async () => {
        try {
          const { mirrorReadFiles, mirrorSync, mirrorRootPath } = await import('../mirror');
          const { notes, notebooks } = get();
          const files = await mirrorReadFiles();
          const res = planImport(notes, notebooks, files);
          set({ notes: res.notes, notebooks: res.notebooks });
          if (res.adoptions.length > 0) {
            await mirrorSync(res.adoptions.map((a) => ({ path: a.path, content: a.content })), []);
          }
          const errs = res.errors.length > 0 ? `, ${res.errors.length} skipped (${res.errors[0]?.message})` : '';
          set({
            mirrorDir: await mirrorRootPath(),
            notice: `Import done: ${res.created} new, ${res.updated} updated${errs}`,
          });
        } catch (e) {
          fail(e);
        }
      },

      /** Refresh sync state from git status. */
      refreshSyncState: async () => {
        try {
          const { gitAvailable, gitStatusRaw, gitGetRemote, gitDeviceName } = await import('../sync');
          const hasGit = await gitAvailable();
          if (!hasGit) { set({ syncState: 'no-git' }); return; }
          const dto = await gitStatusRaw();
          if (!dto.hasRepo) { set({ syncState: 'no-repo' }); return; }
          const status = parsePorcelain(dto.raw);
          set({
            syncState: classifySyncState({ hasGit: dto.hasGit, hasRepo: dto.hasRepo, status }),
            remoteUrl: await gitGetRemote(),
            syncDevice: await gitDeviceName(),
          });
        } catch (e) {
          fail(e);
        }
      },

      /** Full sync: export → commit → pull → resolve conflicts → push → import. */
      syncNow: async () => {
        if (get().syncBusy) return;
        set({ syncBusy: true });
        try {
          const {
            gitStatusRaw, gitCommitAll, gitPull, gitPush,
            gitConflictStages, gitAdd, gitFinishMerge,
          } = await import('../sync');
          const { mirrorReadFiles, mirrorSync, mirrorRootPath } = await import('../mirror');

          // 1. Export notes to ~/devnote (batched into one Rust call)
          const { notes, notebooks, syncDevice } = get();
          const files = await mirrorReadFiles();
          const exp = planExport(notes, notebooks, files);
          await mirrorSync(exp.writes.map((w) => ({ path: w.path, content: w.content })), exp.deletes);
          set({ mirrorDir: await mirrorRootPath() });

          // 2. Stage + commit
          await gitCommitAll(syncCommitMessage(new Date().toISOString(), syncDevice));

          // 3. Pull (may cause merge conflicts)
          const pull = await gitPull();
          if (pull.conflict) {
            // Resolve: for each conflicted file, pick newer updatedAt, write loser as .conflict-<device>.md
            const dto = await gitStatusRaw();
            const status = parsePorcelain(dto.raw);
            const paths = conflictedPaths(status);
            const resolved: string[] = [];
            const conflictWrites: { path: string; content: string }[] = [];
            for (const p of paths) {
              const stages = await gitConflictStages(p);
              if (!stages.ours && !stages.theirs) continue;
              const now = new Date().toISOString();
              const resolution = resolveConflict(
                stages.ours || stages.base || '', stages.theirs || stages.base || '', p, syncDevice, now,
              );
              conflictWrites.push({ path: p, content: resolution.resolved });
              if (resolution.conflict) {
                conflictWrites.push(resolution.conflict);
              }
              resolved.push(p);
            }
            if (conflictWrites.length > 0) {
              await mirrorSync(conflictWrites, []);
            }
            if (resolved.length > 0) {
              await gitAdd(resolved);
              await gitFinishMerge(syncCommitMessage(new Date().toISOString(), syncDevice));
            }
            set({ notice: `Sync done: ${resolved.length} conflict(s) resolved` });
          } else {
            // 4. Push
            const push = await gitPush();
            if (!push.ok) {
              set({ notice: `Push failed: ${push.message}` });
            }
          }

          // 5. Import back (pull may have brought remote changes, or merge added loser files)
          const filesAfter = await mirrorReadFiles();
          const imp = planImport(get().notes, get().notebooks, filesAfter);
          set({ notes: imp.notes, notebooks: imp.notebooks });
          if (imp.adoptions.length > 0) {
            await mirrorSync(imp.adoptions.map((a) => ({ path: a.path, content: a.content })), []);
          }

          await get().refreshSyncState();
        } catch (e) {
          fail(e);
        } finally {
          set({ syncBusy: false });
        }
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
