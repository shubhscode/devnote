import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  generateId,
  isExclusionsOnly,
  isValidThemeId,
  markTemplateUsed,
  nowIso,
  parseSearch,
  parseTemplateBody,
  planExport,
  planImport,
  pushRevision,
  renameNotebook,
  restoreNotes,
  searchNotes,
  shouldSnapshot,
  sortNotes,
  trashNotes,
  updateCustomTemplate,
  updateNote,
} from '@devnote/core';
import type { Note, Notebook, NoteStatus, Revision, Template, TreeNode } from '@devnote/core';
import { classifySyncState, conflictedPaths, parsePorcelain, resolveConflict, syncCommitMessage } from '@devnote/sync';
import type { SyncState } from '@devnote/sync';

export type { TreeNode };
export type Selection =
  | { kind: 'all' }
  | { kind: 'notebook'; id: string }
  | { kind: 'trash' };

const STORAGE_KEY = 'devnote:v1';
const TEMPLATES_KEY = 'devnote:templates:v1';
const RECENTS_KEY = 'devnote:template-recents:v1';
const REVISIONS_KEY = 'devnote:revisions:v1';
const SETTINGS_KEY = 'devnote:settings:v1';
const IDLE_SNAPSHOT_MS = 30_000;

export type ThemeMode = 'light' | 'dark' | 'system';
/** Any bundled (`light`, `dracula`, …) or plugin theme id. */
export type ThemeId = string;

export interface Settings {
  /** Explicit default notebook; null = first root notebook. */
  defaultNotebookId: string | null;
  /** Theme id from the core registry (`light`/`dark`/`system` + community). */
  theme: ThemeId;
  wordWrap: boolean;
  /** Editor font size, px (clamped 11–18). */
  fontSize: number;
}

const DEFAULT_SETTINGS: Settings = {
  defaultNotebookId: null,
  theme: 'system',
  wordWrap: true,
  fontSize: 13.5,
};

function loadSettings(): Settings {
  const fallback = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Settings>;
      return {
        defaultNotebookId: typeof p.defaultNotebookId === 'string' ? p.defaultNotebookId : null,
        theme: typeof p.theme === 'string' && isValidThemeId(p.theme) ? p.theme : fallback.theme,
        wordWrap: typeof p.wordWrap === 'boolean' ? p.wordWrap : fallback.wordWrap,
        fontSize: typeof p.fontSize === 'number' ? Math.min(18, Math.max(11, p.fontSize)) : fallback.fontSize,
      };
    }
    // One-time migration from the Phase 0/1 theme flag.
    const legacy = localStorage.getItem('devnote:theme');
    if (legacy === 'light' || legacy === 'dark') return { ...fallback, theme: legacy };
  } catch { /* ignore */ }
  return fallback;
}

function seedData(): { notebooks: Notebook[]; notes: Note[] } {
  const t = nowIso();
  const inbox: Notebook = {
    id: generateId(), name: 'Inbox', parentId: null, sortOrder: 0, createdAt: t, updatedAt: t,
  };
  const projects: Notebook = {
    id: generateId(), name: 'Projects', parentId: null, sortOrder: 1, createdAt: t, updatedAt: t,
  };
  const devnote: Notebook = {
    id: generateId(), name: 'devnote', parentId: projects.id, sortOrder: 0, createdAt: t, updatedAt: t,
  };
  const notebooks = [inbox, projects, devnote];
  const mk = (notebookId: string, title: string, body: string, tags: string[]): Note => ({
    id: generateId(), title, body, notebookId, tags,
    status: 'none', pinned: false, trashed: false, createdAt: t, updatedAt: t,
  });
  const notes = [
    mk(inbox.id, 'Welcome to devnote',
      '# Welcome\n\nLocal-first notes. No subscription.\n\n- [ ] Create a notebook\n- [ ] Write with `book:`, `tag:`, `status:` search',
      ['meta']),
    mk(devnote.id, 'Roadmap', 'See PLAN.md in the repo.\n\n> [!NOTE]\n> Phase 1a: CRUD + tree.', ['plan']),
  ];
  return { notebooks, notes };
}

function loadTemplates(): Template[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is Template =>
        typeof t === 'object' && t !== null &&
        typeof (t as Template).id === 'string' &&
        typeof (t as Template).name === 'string' &&
        typeof (t as Template).body === 'string',
    );
  } catch {
    return [];
  }
}

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed = raw === null ? [] : (JSON.parse(raw) as unknown);
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
}

function isRevision(v: unknown): v is Revision {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as Revision).id === 'string' &&
    typeof (v as Revision).noteId === 'string' &&
    typeof (v as Revision).title === 'string' &&
    typeof (v as Revision).body === 'string' &&
    typeof (v as Revision).createdAt === 'string'
  );
}

function loadRevisions(): Revision[] {
  try {
    const raw = localStorage.getItem(REVISIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isRevision) : [];
  } catch {
    return [];
  }
}
function load(): { notebooks: Notebook[]; notes: Note[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedData();
    const parsed = JSON.parse(raw) as { notebooks?: Notebook[]; notes?: Note[] };
    if (!Array.isArray(parsed.notebooks) || !Array.isArray(parsed.notes)) return seedData();
    return { notebooks: parsed.notebooks, notes: parsed.notes };
  } catch {
    return seedData();
  }
}

export type SearchScope = 'local' | 'global';

/** Direct filter (no ref dependency — used inside computeVisible). */
function filterBySelectionDirect(
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
): Note[] {
  const base = filterBySelectionDirect(notes, notebooks, selection, expanded);
  const q = rawQuery.trim();
  if (q === '') return sortNotes(base);
  return searchNotes(base, notebooks, q).map((s) => s.note);
}

export function useDevnoteStore() {
  const [initial] = useState(load);
  const [notebooks, setNotebooks] = useState<Notebook[]>(initial.notebooks);
  const [notes, setNotes] = useState<Note[]>(initial.notes);
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ notebooks, notes }));
      } catch {
        // Quota/privacy mode — session-only. Non-fatal.
      }
    }, 400);
    return () => clearTimeout(t);
  }, [notebooks, notes]);

  useEffect(() => {
    // Never lose the trailing debounced write on tab close.
    const flush = () => {
      try {
        const cur = live.current;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ notebooks: cur.notebooks, notes: cur.notes }));
      } catch { /* ignore */ }
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const [customTemplates, setCustomTemplates] = useState<Template[]>(loadTemplates);
  const [templateRecents, setTemplateRecents] = useState<string[]>(loadRecents);
  const [revisions, setRevisions] = useState<Revision[]>(loadRevisions);
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* ignore */ }
  }, [settings]);

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
  const live = useRef({ notes: initial.notes, notebooks: initial.notebooks, revisions: loadRevisions() });
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
      localStorage.setItem(TEMPLATES_KEY, JSON.stringify(customTemplates));
    } catch { /* ignore */ }
  }, [customTemplates]);

  useEffect(() => {
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(templateRecents));
    } catch { /* ignore */ }
  }, [templateRecents]);

  useEffect(() => {
    try {
      localStorage.setItem(REVISIONS_KEY, JSON.stringify(revisions));
    } catch { /* ignore */ }
  }, [revisions]);

  const fail = useCallback((e: unknown) => {
    setNotice(e instanceof Error ? e.message : 'Something went wrong');
  }, []);

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
      if (q === '') return sortNotes(filteredBySelection);
      return searchNotes(filteredBySelection, notebooks, q).map((s) => s.note);
    },
    [filteredBySelection, notebooks, query, scope],
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
    setActiveNoteId(computeVisible(notes, notebooks, s, expanded, '', 'local')[0]?.id ?? null);
    setPast([]);
    setFuture([]);
  }, [notes, notebooks, expanded, snapshotNote, workspaceId]);

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
    setActiveNoteId(computeVisible(notes, notebooks, s, expanded, '', 'local')[0]?.id ?? null);
    setPast([]);
    setFuture([]);
  }, [notes, notebooks, expanded, snapshotNote, fail]);

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
    addNotebook, rename, removeNotebook, toggleExpand, workspaceId, focusWorkspace, clearWorkspace, toggleWorkspace,
    allTemplates, templateRecents, externalBodyWrite, revisions, settings, mirrorDir,
    createTemplate, updateTemplate, deleteTemplate, duplicateTemplate, applyTemplateToNote,
    snapshotNote, snapshotIdle, restoreRevision, updateSettings,
    exportMirror, importMirror,
    syncState, syncDevice, remoteUrl, syncBusy, syncNow, refreshSyncState,
  };
}

export type DevnoteStore = ReturnType<typeof useDevnoteStore>;
