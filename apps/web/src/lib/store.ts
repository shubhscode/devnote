import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SetStateAction } from 'react';
import {
  BUILTIN_TEMPLATES,
  allTags,
  applyTemplate,
  buildNotebookTree,
  countDirectNotes,
  createCustomTemplate,
  createNote,
  createNotebook,
  deleteCustomTemplate,
  deleteNotebook,
  deleteNotesPermanently,
  descendantIds,
  duplicateAsCustom,
  duplicateNote,
  isExclusionsOnly,
  isQuotaError,
  markTemplateUsed,
  nowIso,
  parseSearch,
  parseTemplateBody,
  planExport,
  planImport,
  pushRevision,
  renameNotebook,
  renameTag as renameTagNotes,
  mergeTags as mergeTagNotes,
  moveNotes as moveNotesCore,
  noteFilename,
  noteToMarkdown,
  untagNotes,
  reorderNotebook as reorderNotebookCore,
  restoreNotes,
  searchNotes,
  setNotesPinned,
  setNotesStatus,
  shouldSnapshot,
  sortNotes,
  tagNotes as tagNotesCore,
  trashNotes,
  updateCustomTemplate,
  updateNote,
} from '@devnote/core';
import type { Note, Notebook, NoteStatus, Revision, StorageAdapter, Template, TreeNode } from '@devnote/core';
import { localStorageAdapter } from './storage';
import { classifySyncState, conflictedPaths, parsePorcelain, resolveConflict, syncCommitMessage } from '@devnote/sync';
import type { SyncState } from '@devnote/sync';
import {
  RECENTS_KEY,
  REVISIONS_KEY,
  SETTINGS_KEY,
  STORAGE_KEY,
  TEMPLATES_KEY,
  loadDB,
  loadPersisted,
  loadRecents,
  loadRevisions,
  loadSettings,
  loadTemplates,
} from './store/persist';
import type { PersistedState } from './store/persist';
import { computeVisible, filterBySelectionDirect } from './store/select';
import { editClock, externalWriteSeq, getDevnoteStore, setStoreState } from './store/state';
import type { SearchScope, Selection, Settings } from './store/types';

export type { TreeNode };
export type { PersistedState, SearchScope, Selection, Settings };
export { computeVisible, loadPersisted };
export { DEFAULT_SETTINGS } from './store/types';
export type { ThemeId, ThemeMode } from './store/types';

export function useDevnoteStore(adapter: StorageAdapter = localStorageAdapter) {
  const store = useMemo(() => getDevnoteStore(adapter), [adapter]);
  const [initial] = useState(() => store.getState());
  // Data slice lives in zustand (Track 1.1); the rest follows slice by slice.
  const notebooks = store((s) => s.notebooks);
  const notes = store((s) => s.notes);
  const setNotebooks = useCallback((u: SetStateAction<Notebook[]>) => setStoreState(store, 'notebooks', u), [store]);
  const setNotes = useCallback((u: SetStateAction<Note[]>) => setStoreState(store, 'notes', u), [store]);
  // UI slice lives in zustand; subscribed per-field so panes stop
  // re-rendering on unrelated state changes (Track 1.1).
  const selection = store((s) => s.selection);
  const activeNoteId = store((s) => s.activeNoteId);
  const selectedIds = store((s) => s.selectedIds);
  const query = store((s) => s.query);
  const scope = store((s) => s.scope);
  /** Workspace root notebook id — sidebar scopes to its subtree. */
  const workspaceId = store((s) => s.workspaceId);
  const expanded = store((s) => s.expanded);
  const past = store((s) => s.past);
  const future = store((s) => s.future);
  const notice = store((s) => s.notice);
  const setSelection = useCallback((u: SetStateAction<Selection>) => setStoreState(store, 'selection', u), [store]);
  const setActiveNoteId = useCallback((u: SetStateAction<string | null>) => setStoreState(store, 'activeNoteId', u), [store]);
  const setSelectedIds = useCallback((u: SetStateAction<string[]>) => setStoreState(store, 'selectedIds', u), [store]);
  const setQuery = useCallback((u: SetStateAction<string>) => setStoreState(store, 'query', u), [store]);
  const setScope = useCallback((u: SetStateAction<SearchScope>) => setStoreState(store, 'scope', u), [store]);
  const setWorkspaceId = useCallback((u: SetStateAction<string | null>) => setStoreState(store, 'workspaceId', u), [store]);
  const setExpanded = useCallback((u: SetStateAction<string[]>) => setStoreState(store, 'expanded', u), [store]);
  const setPast = useCallback((u: SetStateAction<string[]>) => setStoreState(store, 'past', u), [store]);
  const setFuture = useCallback((u: SetStateAction<string[]>) => setStoreState(store, 'future', u), [store]);
  const setNotice = useCallback((u: SetStateAction<string | null>) => setStoreState(store, 'notice', u), [store]);

  useEffect(() => {
    // Debounced: stringifying thousands of notes per keystroke janks.
    const t = setTimeout(() => {
      try {
        adapter.setItem(STORAGE_KEY, JSON.stringify({ notebooks, notes }));
      } catch (e) {
        // Quota/privacy mode — session-only. Quota gets a loud warning; privacy stays silent.
        if (isQuotaError(e)) {
          setNotice('Storage full — changes kept for this session only. Export a backup or prune revision history.');
        }
      }
    }, 400);
    return () => clearTimeout(t);
  }, [notebooks, notes, adapter]);

  useEffect(() => {
    // Never lose the trailing debounced write on tab close.
    const flush = () => {
      try {
        const cur = store.getState();
        adapter.setItem(STORAGE_KEY, JSON.stringify({ notebooks: cur.notebooks, notes: cur.notes }));
      } catch { /* ignore */ }
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [adapter, store]);

  const customTemplates = store((s) => s.customTemplates);
  const templateRecents = store((s) => s.templateRecents);
  const revisions = store((s) => s.revisions);
  const settings = store((s) => s.settings);
  const setCustomTemplates = useCallback((u: SetStateAction<Template[]>) => setStoreState(store, 'customTemplates', u), [store]);
  const setTemplateRecents = useCallback((u: SetStateAction<string[]>) => setStoreState(store, 'templateRecents', u), [store]);
  const setRevisions = useCallback((u: SetStateAction<Revision[]>) => setStoreState(store, 'revisions', u), [store]);
  const setSettings = useCallback((u: SetStateAction<Settings>) => setStoreState(store, 'settings', u), [store]);

  useEffect(() => {
    try {
      adapter.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      if (isQuotaError(e)) setNotice('Storage full — settings kept for this session only.');
    }
  }, [settings, adapter]);

  // External body writes (template apply, revision restore): the editor view
  // can't distinguish these from its own keystrokes, so they travel with a
  // sequence number the CodeMirror host applies explicitly.
  const externalBodyWrite = store((s) => s.externalBodyWrite);
  const setExternalBodyWrite = useCallback(
    (u: SetStateAction<{ noteId: string; body: string; seq: number } | null>) => setStoreState(store, 'externalBodyWrite', u),
    [store],
  );

  useEffect(() => {
    try {
      adapter.setItem(TEMPLATES_KEY, JSON.stringify(customTemplates));
    } catch { /* ignore */ }
  }, [customTemplates, adapter]);

  useEffect(() => {
    try {
      adapter.setItem(RECENTS_KEY, JSON.stringify(templateRecents));
    } catch { /* ignore */ }
  }, [templateRecents, adapter]);

  useEffect(() => {
    try {
      adapter.setItem(REVISIONS_KEY, JSON.stringify(revisions));
    } catch { /* ignore */ }
  }, [revisions, adapter]);

  const fail = useCallback((e: unknown) => {
    setNotice(e instanceof Error ? e.message : 'Something went wrong');
  }, []);

  // Corrupt payloads were quarantined during load — say so once, loudly.
  useEffect(() => {
    if (initial.corruptedKeys.length > 0) {
      setNotice(
        `Recovered from corrupt saved data (${initial.corruptedKeys.join(', ')}). Bad copy kept as backup — export a backup from Preferences.`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-tab: another tab wrote our keys — reload that slice, keep typing safe.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.newValue === null) return;
      try {
        if (e.key === STORAGE_KEY) {
          const db = loadDB(adapter);
          if (db.corrupted) return;
          setNotebooks(db.value.notebooks);
          setNotes(db.value.notes);
          setNotice('Notes updated from another tab');
        } else if (e.key === SETTINGS_KEY) {
          const s = loadSettings(adapter);
          if (!s.corrupted) setSettings(s.value);
        } else if (e.key === TEMPLATES_KEY) {
          const t = loadTemplates(adapter);
          if (!t.corrupted) setCustomTemplates(t.value);
        } else if (e.key === RECENTS_KEY) {
          const r = loadRecents(adapter);
          if (!r.corrupted) setTemplateRecents(r.value);
        } else if (e.key === REVISIONS_KEY) {
          const r = loadRevisions(adapter);
          if (!r.corrupted) setRevisions(r.value);
        }
      } catch { /* keep current state on bad cross-tab payload */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [adapter]);

  const allTemplates = useMemo(
    () => [...customTemplates, ...BUILTIN_TEMPLATES],
    [customTemplates],
  );

  const tree: TreeNode[] = useMemo(() => {
    try {
      return buildNotebookTree(notebooks);
    } catch {
      return [];
    }
  }, [notebooks]);

  const counts = useMemo(() => countDirectNotes(notes), [notes]);
  const tags = useMemo(() => allTags(notes), [notes]);
  const trashedCount = useMemo(() => notes.filter((n) => n.trashed).length, [notes]);

  const defaultNotebookId = useMemo(() => {
    if (settings.defaultNotebookId !== null && notebooks.some((n) => n.id === settings.defaultNotebookId)) {
      return settings.defaultNotebookId;
    }
    const roots = notebooks.filter((n) => n.parentId === null);
    return roots[0]?.id ?? notebooks[0]?.id ?? null;
  }, [notebooks, settings.defaultNotebookId]);

  // Stage 1: filter by selection — recomputes on notes change (editor typing)
  // but is cheap (just array filter). Search is deferred to stage 2.
  const filteredBySelection: Note[] = useMemo(
    () => filterBySelectionDirect(notes, notebooks, selection, expanded),
    [notes, notebooks, selection, expanded],
  );
  // Stage 2: apply search — only recomputes when query/scope changes, NOT on every keystroke.
  const visibleNotes: Note[] = useMemo(
    () => {
      const q = query.trim();
      if (q === '') return sortNotes(filteredBySelection, settings.noteSort);
      return searchNotes(filteredBySelection, notebooks, q).map((s) => s.note);
    },
    [filteredBySelection, notebooks, query, scope, settings.noteSort],
  );

  const exclusionsOnly = useMemo(
    () => query.trim() !== '' && isExclusionsOnly(parseSearch(query)),
    [query],
  );

  const activeNote: Note | null = useMemo(
    () => notes.find((n) => n.id === activeNoteId) ?? null,
    [notes, activeNoteId],
  );

  // ---------- file mirror + git sync (Phase 3a/3b, desktop only) ----------

  const mirrorDir = store((s) => s.mirrorDir);
  const syncState = store((s) => s.syncState);
  const syncDevice = store((s) => s.syncDevice);
  const remoteUrl = store((s) => s.remoteUrl);
  const syncBusy = store((s) => s.syncBusy);
  const setMirrorDir = useCallback((u: SetStateAction<string | null>) => setStoreState(store, 'mirrorDir', u), [store]);
  const setSyncState = useCallback((u: SetStateAction<SyncState>) => setStoreState(store, 'syncState', u), [store]);
  const setSyncDevice = useCallback((u: SetStateAction<string>) => setStoreState(store, 'syncDevice', u), [store]);
  const setRemoteUrl = useCallback((u: SetStateAction<string | null>) => setStoreState(store, 'remoteUrl', u), [store]);
  const setSyncBusy = useCallback((u: SetStateAction<boolean>) => setStoreState(store, 'syncBusy', u), [store]);

  // Data/nav/revision actions live in the zustand store (stable identities).
  const storeActions = store.getState();
  const { refreshSyncState } = storeActions;

  /** Initialize sync state on mount. */
  useEffect(() => { refreshSyncState(); }, [refreshSyncState]);

  // ---------- templates ----------

  // ---------- templates (actions live in the store) ----------

  return {
    notebooks, notes, tree, counts, tags, trashedCount, defaultNotebookId,
    selection, activeNoteId, activeNote, selectedIds, query, scope, expanded,
    past, future, notice, visibleNotes, exclusionsOnly,
    setQuery, setScope, setNotice,
    select: storeActions.select,
    openNote: storeActions.openNote,
    navigateTo: storeActions.navigateTo,
    goBack: storeActions.goBack,
    goForward: storeActions.goForward,
    newNote: storeActions.newNote,
    commitPatch: storeActions.commitPatch,
    duplicate: storeActions.duplicate,
    trash: storeActions.trash,
    restore: storeActions.restore,
    destroy: storeActions.destroy,
    moveNotesTo: storeActions.moveNotesTo,
    bulkTag: storeActions.bulkTag,
    bulkStatus: storeActions.bulkStatus,
    bulkPin: storeActions.bulkPin,
    exportNotes: storeActions.exportNotes,
    selectRange: storeActions.selectRange,
    toggleScope: storeActions.toggleScope,
    setSelectedIds,
    addNotebook: storeActions.addNotebook,
    rename: storeActions.rename,
    removeNotebook: storeActions.removeNotebook,
    reorderNotebook: storeActions.reorderNotebook,
    toggleExpand: storeActions.toggleExpand,
    workspaceId,
    focusWorkspace: storeActions.focusWorkspace,
    clearWorkspace: storeActions.clearWorkspace,
    toggleWorkspace: storeActions.toggleWorkspace,
    renameTag: storeActions.renameTag,
    mergeTags: storeActions.mergeTags,
    deleteTag: storeActions.deleteTag,
    allTemplates, templateRecents, externalBodyWrite, revisions, settings, mirrorDir,
    createTemplate: storeActions.createTemplate,
    updateTemplate: storeActions.updateTemplate,
    deleteTemplate: storeActions.deleteTemplate,
    duplicateTemplate: storeActions.duplicateTemplate,
    applyTemplateToNote: storeActions.applyTemplateToNote,
    snapshotNote: storeActions.snapshotNote,
    snapshotIdle: storeActions.snapshotIdle,
    restoreRevision: storeActions.restoreRevision,
    updateSettings: storeActions.updateSettings,
    exportMirror: storeActions.exportMirror,
    importMirror: storeActions.importMirror,
    syncState, syncDevice, remoteUrl, syncBusy,
    syncNow: storeActions.syncNow,
    refreshSyncState,
  };
}

export type DevnoteStore = ReturnType<typeof useDevnoteStore>;
