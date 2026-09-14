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

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({
      ...s,
      ...patch,
      ...(patch.fontSize !== undefined
        ? { fontSize: Math.min(18, Math.max(11, patch.fontSize)) }
        : {}),
    }));
  }, []);

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

  /** Write all notes to ~/devnote, pruning moved/deleted files. */
  const exportMirror = useCallback(async (): Promise<void> => {
    try {
      const { mirrorReadFiles, mirrorSync, mirrorRootPath } = await import('./mirror');
      const files = await mirrorReadFiles();
      const plan = planExport(notes, notebooks, files);
      await mirrorSync(plan.writes, plan.deletes);
      setMirrorDir(await mirrorRootPath());
      setNotice(`Mirror updated: ${plan.writes.length} written, ${plan.deletes.length} removed, ${plan.skipped} unchanged`);
    } catch (e) {
      fail(e);
    }
  }, [notes, notebooks, fail]);

  /** Read ~/devnote into notes (newer-updatedAt wins, never deletes). */
  const importMirror = useCallback(async (): Promise<void> => {
    try {
      const { mirrorReadFiles, mirrorSync, mirrorRootPath } = await import('./mirror');
      const files = await mirrorReadFiles();
      const res = planImport(notes, notebooks, files);
      setNotes(res.notes);
      setNotebooks(res.notebooks);
      if (res.adoptions.length > 0) {
        await mirrorSync(res.adoptions.map((a) => ({ path: a.path, content: a.content })), []);
      }
      setMirrorDir(await mirrorRootPath());
      const errs = res.errors.length > 0 ? `, ${res.errors.length} skipped (${res.errors[0]?.message})` : '';
      setNotice(`Import done: ${res.created} new, ${res.updated} updated${errs}`);
    } catch (e) {
      fail(e);
    }
  }, [notes, notebooks, fail]);

  // ---------- git sync (Phase 3b) ----------

  /** Refresh sync state from git status. */
  const refreshSyncState = useCallback(async (): Promise<void> => {
    try {
      const { gitAvailable, gitStatusRaw, gitGetRemote, gitDeviceName } = await import('./sync');
      const hasGit = await gitAvailable();
      if (!hasGit) { setSyncState('no-git'); return; }
      const dto = await gitStatusRaw();
      if (!dto.hasRepo) { setSyncState('no-repo'); return; }
      const status = parsePorcelain(dto.raw);
      setSyncState(classifySyncState({ hasGit: dto.hasGit, hasRepo: dto.hasRepo, status }));
      setRemoteUrl(await gitGetRemote());
      setSyncDevice(await gitDeviceName());
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  /** Full sync: export → commit → pull → resolve conflicts → push → import. */
  const syncNow = useCallback(async (): Promise<void> => {
    if (syncBusy) return;
    setSyncBusy(true);
    try {
      const {
        gitStatusRaw, gitCommitAll, gitPull, gitPush,
        gitConflictStages, gitAdd, gitFinishMerge,
      } = await import('./sync');
      const { mirrorReadFiles, mirrorSync, mirrorRootPath } = await import('./mirror');

      // 1. Export notes to ~/devnote (batched into one Rust call)
      const files = await mirrorReadFiles();
      const exp = planExport(notes, notebooks, files);
      await mirrorSync(exp.writes.map((w) => ({ path: w.path, content: w.content })), exp.deletes);
      setMirrorDir(await mirrorRootPath());

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
        setNotice(`Sync done: ${resolved.length} conflict(s) resolved`);
      } else {
        // 4. Push
        const push = await gitPush();
        if (!push.ok) {
          setNotice(`Push failed: ${push.message}`);
        }
      }

      // 5. Import back (pull may have brought remote changes, or merge added loser files)
      const filesAfter = await mirrorReadFiles();
      const imp = planImport(notes, notebooks, filesAfter);
      setNotes(imp.notes);
      setNotebooks(imp.notebooks);
      if (imp.adoptions.length > 0) {
        await mirrorSync(imp.adoptions.map((a) => ({ path: a.path, content: a.content })), []);
      }

      await refreshSyncState();
    } catch (e) {
      fail(e);
    } finally {
      setSyncBusy(false);
    }
  }, [notes, notebooks, syncBusy, syncDevice, fail, refreshSyncState]);

  /** Initialize sync state on mount. */
  useEffect(() => { refreshSyncState(); }, [refreshSyncState]);

  // Data actions live in the zustand store (stable identities via get()/set()).
  const storeActions = store.getState();

  // ---------- templates ----------

  const createTemplate = useCallback((input: { name: string; body: string; description?: string }): string | null => {
    try {
      const next = createCustomTemplate(customTemplates, input);
      const id = next[next.length - 1]?.id ?? null;
      setCustomTemplates(next);
      return id;
    } catch (e) {
      fail(e);
      return null;
    }
  }, [customTemplates, fail]);

  const updateTemplate = useCallback((id: string, patch: { name?: string; body?: string; description?: string }) => {
    try {
      setCustomTemplates((cs) => updateCustomTemplate(cs, [...cs, ...BUILTIN_TEMPLATES], id, patch));
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  const deleteTemplate = useCallback((id: string) => {
    try {
      setCustomTemplates((cs) => deleteCustomTemplate(cs, [...cs, ...BUILTIN_TEMPLATES], id));
      setTemplateRecents((r) => r.filter((x) => x !== id));
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  const duplicateTemplate = useCallback((id: string): string | null => {
    try {
      const r = duplicateAsCustom(customTemplates, [...customTemplates, ...BUILTIN_TEMPLATES], id);
      setCustomTemplates(r.customs);
      return r.template.id;
    } catch (e) {
      fail(e);
      return null;
    }
  }, [customTemplates, fail]);

  /**
   * Apply a template: fills the active note in place when it's still empty,
   * otherwise creates a fresh note (template `notebook` wins, then current
   * notebook, then default). Returns the target note id.
   */
  const applyTemplateToNote = useCallback((templateId: string): string | null => {
    const snapshot = storeActions.snapshotNote;
    const all = [...customTemplates, ...BUILTIN_TEMPLATES];
    const tpl = all.find((t) => t.id === templateId);
    if (!tpl) {
      setNotice('Template not found');
      return null;
    }
    const now = new Date();
    const current = notes.find((n) => n.id === activeNoteId) ?? null;
    setTemplateRecents((r) => markTemplateUsed(r, templateId));
    if (current !== null && !current.trashed && current.title.trim() === '' && current.body.trim() === '') {
      const applied = applyTemplate(tpl, { title: '', tags: current.tags, status: current.status }, now);
      snapshot(current.id); // in-place fill is a content change — keep history
      try {
        setNotes((ns) => updateNote(ns, notebooks, current.id, {
          title: applied.title, body: applied.body, tags: applied.tags, status: applied.status,
        }));
      } catch (e) {
        fail(e);
        return null;
      }
      externalWriteSeq.current += 1;
      setExternalBodyWrite({ noteId: current.id, body: applied.body, seq: externalWriteSeq.current });
      return current.id;
    }
    const { config } = parseTemplateBody(tpl.body);
    let target = defaultNotebookId;
    if (config.notebook) {
      const found = notebooks.find((n) => n.name.toLowerCase() === config.notebook!.toLowerCase());
      if (found) target = found.id;
    } else if (selection.kind === 'notebook') {
      target = selection.id;
    }
    if (target === null) {
      setNotice('Create a notebook first');
      return null;
    }
    try {
      const created = createNote(notes, notebooks, { notebookId: target });
      const applied = applyTemplate(tpl, { title: '', tags: [], status: 'none' }, now);
      setNotes(updateNote(created.notes, notebooks, created.note.id, {
        title: applied.title, body: applied.body, tags: applied.tags, status: applied.status,
      }));
      setSelectedIds([created.note.id]);
      setActiveNoteId(created.note.id);
      return created.note.id;
    } catch (e) {
      fail(e);
      return null;
    }
  }, [customTemplates, notes, notebooks, activeNoteId, selection, defaultNotebookId, storeActions, fail]);

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
    createTemplate, updateTemplate, deleteTemplate, duplicateTemplate, applyTemplateToNote,
    snapshotNote: storeActions.snapshotNote,
    snapshotIdle: storeActions.snapshotIdle,
    restoreRevision: storeActions.restoreRevision,
    updateSettings,
    exportMirror, importMirror,
    syncState, syncDevice, remoteUrl, syncBusy, syncNow, refreshSyncState,
  };
}

export type DevnoteStore = ReturnType<typeof useDevnoteStore>;
