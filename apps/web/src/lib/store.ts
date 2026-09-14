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
import { getDevnoteStore, setStoreState } from './store/state';
import type { SearchScope, Selection, Settings } from './store/types';

export type { TreeNode };
export type { PersistedState, SearchScope, Selection, Settings };
export { computeVisible, loadPersisted };
export { DEFAULT_SETTINGS } from './store/types';
export type { ThemeId, ThemeMode } from './store/types';

const IDLE_SNAPSHOT_MS = 30_000;

export function useDevnoteStore(adapter: StorageAdapter = localStorageAdapter) {
  const store = useMemo(() => getDevnoteStore(adapter), [adapter]);
  const [initial] = useState(() => store.getState());
  // Data slice lives in zustand (Track 1.1); the rest follows slice by slice.
  const notebooks = store((s) => s.notebooks);
  const notes = store((s) => s.notes);
  const setNotebooks = useCallback((u: SetStateAction<Notebook[]>) => setStoreState(store, 'notebooks', u), [store]);
  const setNotes = useCallback((u: SetStateAction<Note[]>) => setStoreState(store, 'notes', u), [store]);
  const [selection, setSelection] = useState<Selection>({ kind: 'all' });
  const [activeNoteId, setActiveNoteId] = useState<string | null>(initial.notes[0]?.id ?? null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('local');
  /** Workspace root notebook id — sidebar scopes to its subtree. */
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [past, setPast] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

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
        const cur = live.current;
        adapter.setItem(STORAGE_KEY, JSON.stringify({ notebooks: cur.notebooks, notes: cur.notes }));
      } catch { /* ignore */ }
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [adapter]);

  const [customTemplates, setCustomTemplates] = useState<Template[]>(initial.customTemplates);
  const [templateRecents, setTemplateRecents] = useState<string[]>(initial.templateRecents);
  const [revisions, setRevisions] = useState<Revision[]>(initial.revisions);
  const [settings, setSettings] = useState<Settings>(initial.settings);

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

  // Fresh-state refs so snapshot helpers never close over stale state.
  const live = useRef({ notes: initial.notes, notebooks: initial.notebooks, revisions: initial.revisions });
  live.current = { notes, notebooks, revisions };
  const activeIdRef = useRef<string | null>(initial.notes[0]?.id ?? null);
  useEffect(() => {
    activeIdRef.current = activeNoteId;
  }, [activeNoteId]);
  const lastEditAt = useRef(0);
  const lastSnap = useRef<{ id: string; title: string; body: string } | null>(null);

  // External body writes (template apply, revision restore): the editor view
  // can't distinguish these from its own keystrokes, so they travel with a
  // sequence number the CodeMirror host applies explicitly.
  const [externalBodyWrite, setExternalBodyWrite] = useState<{ noteId: string; body: string; seq: number } | null>(null);
  const externalSeq = useRef(0);

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

  /** Snapshot a note if its content differs from its newest revision. Deduped per content. */
  const snapshotNote = useCallback((noteId: string) => {
    const { notes: ns, revisions: rs } = live.current;
    const n = ns.find((x) => x.id === noteId);
    if (!n || n.trashed) return;
    const key = { id: noteId, title: n.title, body: n.body };
    const last = lastSnap.current;
    if (last && last.id === key.id && last.title === key.title && last.body === key.body) return;
    if (!shouldSnapshot(rs, noteId, n.title, n.body)) {
      lastSnap.current = key;
      return;
    }
    lastSnap.current = key;
    setRevisions((prev) => pushRevision(prev, noteId, n.title, n.body));
  }, []);

  /** Idle trigger (called on an interval): snapshot the active note after 30s quiet. */
  const snapshotIdle = useCallback(() => {
    const id = activeIdRef.current;
    if (id === null) return;
    if (Date.now() - lastEditAt.current < IDLE_SNAPSHOT_MS) return;
    snapshotNote(id);
  }, [snapshotNote]);

  /** Restore a revision. Pre-restore state is snapshotted first, so restores are undoable. */
  const restoreRevision = useCallback((noteId: string, revisionId: string) => {
    const rev = live.current.revisions.find((r) => r.id === revisionId && r.noteId === noteId);
    if (!rev) {
      setNotice('Revision not found');
      return;
    }
    snapshotNote(noteId);
    try {
      setNotes((ns) => updateNote(ns, notebooks, noteId, { title: rev.title, body: rev.body }));
    } catch (e) {
      fail(e);
      return;
    }
    externalSeq.current += 1;
    setExternalBodyWrite({ noteId, body: rev.body, seq: externalSeq.current });
    setNotice('Revision restored — previous version kept in history');
  }, [notebooks, snapshotNote, fail]);

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

  const navigateTo = useCallback((id: string | null) => {
    const prev = activeIdRef.current;
    if (prev !== null && prev !== id) {
      snapshotNote(prev);
      setPast((p) => [...p.slice(-49), prev]);
      setFuture([]);
    }
    setActiveNoteId(id);
  }, [snapshotNote]);

  const goBack = useCallback(() => {
    const cur = activeIdRef.current;
    if (cur !== null) snapshotNote(cur);
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setActiveNoteId((c) => {
        if (c !== null && prev !== undefined) setFuture((f) => [c, ...f]);
        return prev ?? c;
      });
      return p.slice(0, -1);
    });
  }, [snapshotNote]);

  const goForward = useCallback(() => {
    const cur = activeIdRef.current;
    if (cur !== null) snapshotNote(cur);
    setFuture((f) => {
      if (f.length === 0) return f;
      const [next, ...rest] = f;
      setActiveNoteId((c) => {
        if (c !== null && next !== undefined) setPast((p) => [...p.slice(-49), c]);
        return next ?? c;
      });
      return rest;
    });
  }, [snapshotNote]);

  const openNote = useCallback((id: string, modClick: boolean) => {
    const cur = activeIdRef.current;
    if (cur !== null && cur !== id) snapshotNote(cur);
    if (modClick) {
      setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
      setActiveNoteId(id);
    } else {
      setSelectedIds([id]);
      navigateTo(id);
    }
  }, [navigateTo, snapshotNote]);

  const select = useCallback((s: Selection) => {
    const cur = activeIdRef.current;
    if (cur !== null) snapshotNote(cur);
    // Leaving the workspace clears it — navigating inside keeps it.
    if (s.kind !== 'notebook' || workspaceId === null || (s.id !== workspaceId && !descendantIds(notebooks, workspaceId).includes(s.id))) {
      setWorkspaceId(null);
    }
    setSelection(s);
    setSelectedIds([]);
    setQuery('');
    setScope('local');
    setActiveNoteId(computeVisible(notes, notebooks, s, expanded, '', 'local', settings.noteSort)[0]?.id ?? null);
    setPast([]);
    setFuture([]);
  }, [notes, notebooks, expanded, snapshotNote, workspaceId, settings.noteSort]);

  /** Focus a notebook as workspace: sidebar scopes to its subtree. */
  const focusWorkspace = useCallback((id: string) => {
    if (!notebooks.some((n) => n.id === id)) {
      setNotice('Notebook not found');
      return;
    }
    const cur = activeIdRef.current;
    if (cur !== null) snapshotNote(cur);
    const s: Selection = { kind: 'notebook', id };
    setWorkspaceId(id);
    setSelection(s);
    setSelectedIds([]);
    setQuery('');
    setScope('local');
    setActiveNoteId(computeVisible(notes, notebooks, s, expanded, '', 'local', settings.noteSort)[0]?.id ?? null);
    setPast([]);
    setFuture([]);
  }, [notes, notebooks, expanded, snapshotNote, fail, settings.noteSort]);

  const clearWorkspace = useCallback(() => {
    setWorkspaceId(null);
  }, []);

  /** Toggle workspace for the selected notebook (else the active note's). */
  const toggleWorkspace = useCallback(() => {
    if (workspaceId !== null) {
      setWorkspaceId(null);
      return;
    }
    const id = selection.kind === 'notebook'
      ? selection.id
      : notes.find((n) => n.id === activeNoteId && !n.trashed)?.notebookId ?? null;
    if (id === null) {
      setNotice('Select a notebook first');
      return;
    }
    focusWorkspace(id);
  }, [workspaceId, selection, notes, activeNoteId, focusWorkspace]);

  // ---------- file mirror + git sync (Phase 3a/3b, desktop only) ----------

  const [mirrorDir, setMirrorDir] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('no-repo');
  const [syncDevice, setSyncDevice] = useState('device');
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);

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

  const newNote = useCallback(() => {
    const target =
      selection.kind === 'notebook' ? selection.id : defaultNotebookId;
    if (target === null) {
      setNotice('Create a notebook first');
      return;
    }
    try {
      const { notes: next, note } = createNote(notes, notebooks, { notebookId: target });
      setNotes(next);
      setSelectedIds([note.id]);
      setActiveNoteId(note.id);
    } catch (e) {
      fail(e);
    }
  }, [notes, notebooks, selection, defaultNotebookId, fail]);

  const commitPatch = useCallback((id: string, patch: { title?: string; body?: string; tags?: string[]; status?: NoteStatus; pinned?: boolean; notebookId?: string }) => {
    try {
      setNotes((ns) => updateNote(ns, notebooks, id, patch));
      lastEditAt.current = Date.now();
    } catch (e) {
      fail(e);
    }
  }, [notebooks, fail]);

  const duplicate = useCallback((ids: string[]) => {
    try {
      let next = notes;
      let first: Note | null = null;
      for (const id of ids) {
        const r = duplicateNote(next, id);
        next = r.notes;
        first ??= r.note;
      }
      setNotes(next);
      if (first) {
        setSelectedIds([first.id]);
        setActiveNoteId(first.id);
      }
    } catch (e) {
      fail(e);
    }
  }, [notes, fail]);

  const trash = useCallback((ids: string[]) => {
    setNotes((ns) => trashNotes(ns, ids));
    setSelectedIds([]);
    setActiveNoteId((cur) => (cur !== null && ids.includes(cur) ? null : cur));
  }, []);

  const restore = useCallback((ids: string[], targetNotebookId: string) => {
    try {
      setNotes((ns) => restoreNotes(ns, notebooks, ids, targetNotebookId));
      setSelectedIds([]);
    } catch (e) {
      fail(e);
    }
  }, [notebooks, fail]);

  const destroy = useCallback((ids: string[]) => {
    try {
      setNotes((ns) => deleteNotesPermanently(ns, ids));
      setSelectedIds([]);
      setActiveNoteId((cur) => (cur !== null && ids.includes(cur) ? null : cur));
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  /** Shift-click range: anchor = last selected (else active), union over visible order. */
  const selectRange = useCallback((id: string) => {
    const order = visibleNotes.map((n) => n.id);
    if (!order.includes(id)) return;
    const anchor = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1]! : activeIdRef.current;
    if (anchor === null || !order.includes(anchor)) {
      setSelectedIds([id]);
    } else {
      const [a, b] = [order.indexOf(anchor), order.indexOf(id)].sort((x, y) => x - y) as [number, number];
      const range = order.slice(a, b + 1);
      setSelectedIds((s) => [...new Set([...s, ...range])]);
    }
    setActiveNoteId(id);
  }, [visibleNotes, selectedIds]);

  const moveNotesTo = useCallback((ids: string[], notebookId: string) => {
    try {
      setNotes((ns) => moveNotesCore(ns, notebooks, ids, notebookId));
    } catch (e) {
      fail(e);
    }
  }, [notebooks, fail]);

  const bulkTag = useCallback((ids: string[], tag: string) => {
    try {
      setNotes((ns) => tagNotesCore(ns, ids, tag));
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  const bulkStatus = useCallback((ids: string[], status: NoteStatus) => {
    try {
      setNotes((ns) => setNotesStatus(ns, ids, status));
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  const bulkPin = useCallback((ids: string[], pinned: boolean) => {
    try {
      setNotes((ns) => setNotesPinned(ns, ids, pinned));
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  /** Download selected notes as individual Markdown files (reimportable via mirror). */
  const exportNotes = useCallback((ids: string[]) => {
    try {
      const set = new Set(ids);
      const targets = notes.filter((n) => set.has(n.id));
      if (targets.length === 0) {
        setNotice('Nothing selected');
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
      setNotice(`Exported ${targets.length} note${targets.length === 1 ? '' : 's'} as Markdown`);
    } catch (e) {
      fail(e);
    }
  }, [notes, notebooks, fail]);

  const reorderNotebook = useCallback((id: string, dir: -1 | 1) => {
    try {
      setNotebooks((ns) => reorderNotebookCore(ns, id, dir));
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  const addNotebook = useCallback((parentId: string | null): string | null => {
    try {
      const next = createNotebook(notebooks, { name: 'Untitled notebook', parentId });
      setNotebooks(next);
      const created = next[next.length - 1];
      return created?.id ?? null;
    } catch (e) {
      fail(e);
      return null;
    }
  }, [notebooks, fail]);

  const rename = useCallback((id: string, name: string) => {
    try {
      setNotebooks((ns) => renameNotebook(ns, id, name));
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  const renameTag = useCallback((oldName: string, newName: string) => {
    try {
      setNotes((ns) => renameTagNotes(ns, oldName, newName));
      if (query.trim().toLowerCase() === `tag:${oldName.trim().toLowerCase()}`) {
        setQuery(`tag:${newName.trim()}`);
      }
    } catch (e) {
      fail(e);
    }
  }, [query, fail]);

  const mergeTags = useCallback((from: string[], into: string) => {
    try {
      setNotes((ns) => mergeTagNotes(ns, from, into));
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  const deleteTag = useCallback((name: string) => {
    try {
      setNotes((ns) => untagNotes(ns, name));
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  const removeNotebook = useCallback((id: string) => {
    try {
      setNotebooks((ns) => deleteNotebook(ns, notes, id));
      setSelection((s) => (s.kind === 'notebook' && s.id === id ? { kind: 'all' } : s));
    } catch (e) {
      fail(e);
    }
  }, [notes, fail]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));
  }, []);

  const toggleScope = useCallback(() => {
    setScope((s) => (s === 'local' ? 'global' : 'local'));
  }, []);

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
      snapshotNote(current.id); // in-place fill is a content change — keep history
      try {
        setNotes((ns) => updateNote(ns, notebooks, current.id, {
          title: applied.title, body: applied.body, tags: applied.tags, status: applied.status,
        }));
      } catch (e) {
        fail(e);
        return null;
      }
      externalSeq.current += 1;
      setExternalBodyWrite({ noteId: current.id, body: applied.body, seq: externalSeq.current });
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
  }, [customTemplates, notes, notebooks, activeNoteId, selection, defaultNotebookId, snapshotNote, fail]);

  return {
    notebooks, notes, tree, counts, tags, trashedCount, defaultNotebookId,
    selection, activeNoteId, activeNote, selectedIds, query, scope, expanded,
    past, future, notice, visibleNotes, exclusionsOnly,
    setQuery, setScope, toggleScope, setNotice, select, openNote, navigateTo, goBack, goForward,
    newNote, commitPatch, duplicate, trash, restore, destroy,
    moveNotesTo, bulkTag, bulkStatus, bulkPin, exportNotes, selectRange, setSelectedIds,
    addNotebook, rename, removeNotebook, reorderNotebook, toggleExpand, workspaceId, focusWorkspace, clearWorkspace, toggleWorkspace,
    renameTag, mergeTags, deleteTag,
    allTemplates, templateRecents, externalBodyWrite, revisions, settings, mirrorDir,
    createTemplate, updateTemplate, deleteTemplate, duplicateTemplate, applyTemplateToNote,
    snapshotNote, snapshotIdle, restoreRevision, updateSettings,
    exportMirror, importMirror,
    syncState, syncDevice, remoteUrl, syncBusy, syncNow, refreshSyncState,
  };
}

export type DevnoteStore = ReturnType<typeof useDevnoteStore>;
