import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, X } from 'reicon-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { EditorView } from '@devnote/editor';
import { BUNDLED_THEMES, BUILTIN_TEMPLATES, THEME_VAR_KEYS, getTheme, resolveIsDark } from '@devnote/core';
import { getDevnoteStore, useDevnote, workspaceScopeIdsFor } from './lib/store';
import { COMMAND_META } from './lib/commands';
import { APP_VERSION, UPDATE_OWNER, UPDATE_REPO } from './lib/version';
import { checkForUpdates, shouldRecheck, type ReleaseInfo } from './lib/updates';
import { openExternal } from './lib/open';
import { isMod, isTypingTarget, modLabel } from './lib/keys';
import { isTauri } from './lib/mirror';
import Sidebar from './components/Sidebar';
import NoteList from './components/NoteList';
import PaneResizer from './components/PaneResizer';
import Editor, { type ViewMode } from './components/Editor';
import { ErrorBoundary } from './components/ErrorBoundary';
import MoveToNotebookDialog from './components/MoveToNotebookDialog';
import ConfirmDialog from './components/ConfirmDialog';
import PreferencesDialog from './components/PreferencesDialog';
import RevisionHistoryDialog from './components/RevisionHistoryDialog';
import Telescope, { type TelescopeAction } from './components/Telescope';
import TemplatePicker from './components/TemplatePicker';

// Phase 2 shell: Sidebar | Note list + search | Editor. Icons: reicon-react
// (Outline default, Filled for selected/active). Theme: light/dark/system via `dark` class.

export default function App() {
  // Cold-only subscriptions (Track 1.1): nothing here changes per keystroke,
  // so typing re-renders the active pane — never this shell. Hot data lives
  // in the panes/dialogs via useDevnote; fire-and-forget reads use the api.
  const api = getDevnoteStore();
  const themeId = useDevnote((s) => s.settings.theme);
  const notice = useDevnote((s) => s.notice);
  const selection = useDevnote((s) => s.selection);
  const notebooks = useDevnote((s) => s.notebooks);
  const workspaceId = useDevnote((s) => s.workspaceId);
  const activeNoteId = useDevnote((s) => s.activeNoteId);
  const syncState = useDevnote((s) => s.syncState);
  const updateSettings = useDevnote((s) => s.updateSettings);
  const select = useDevnote((s) => s.select);
  const dismissNotice = useDevnote((s) => s.patch);
  const syncNow = useDevnote((s) => s.syncNow);
  const restoreNotes = useDevnote((s) => s.restore);
  const moveNotesTo = useDevnote((s) => s.moveNotesTo);
  const destroyNotes = useDevnote((s) => s.destroy);
  const removeNotebook = useDevnote((s) => s.removeNotebook);
  const deleteTag = useDevnote((s) => s.deleteTag);
  const restoreRevision = useDevnote((s) => s.restoreRevision);
  const exportMirror = useDevnote((s) => s.exportMirror);
  const importMirror = useDevnote((s) => s.importMirror);
  const refreshSyncState = useDevnote((s) => s.refreshSyncState);
  const createTemplate = useDevnote((s) => s.createTemplate);
  const updateTemplate = useDevnote((s) => s.updateTemplate);
  const deleteTemplate = useDevnote((s) => s.deleteTemplate);
  const duplicateTemplate = useDevnote((s) => s.duplicateTemplate);
  const applyTemplateToNote = useDevnote((s) => s.applyTemplateToNote);
  // Cold slices for dialogs (templates, revisions, prefs) — none changes per keystroke.
  const customTemplates = useDevnote((s) => s.customTemplates);
  const allTemplates = useMemo(() => [...customTemplates, ...BUILTIN_TEMPLATES], [customTemplates]);
  const templateRecents = useDevnote((s) => s.templateRecents);
  const revisions = useDevnote((s) => s.revisions);
  const settings = useDevnote((s) => s.settings);
  const mirrorDir = useDevnote((s) => s.mirrorDir);
  const remoteUrl = useDevnote((s) => s.remoteUrl);
  const syncBusy = useDevnote((s) => s.syncBusy);
  const conflictNoteIds = useDevnote((s) => s.conflictNoteIds);
  const openNoteById = useDevnote((s) => s.openNote);
  const sidebarWidth = useDevnote((s) => s.settings.sidebarWidth);
  const listWidth = useDevnote((s) => s.settings.listWidth);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [listOpen, setListOpen] = useState(true);
  // Narrow windows start with the sidebar hidden (never auto-reopened).
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    if (mq.matches) setSidebarOpen(false);
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setSidebarOpen(false); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const [focusMode, setFocusMode] = useState(false); // distraction-free: editor only
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('devnote:viewmode');
    return saved === 'preview' || saved === 'split' ? saved : 'edit';
  });
  const [restoreIds, setRestoreIds] = useState<string[] | null>(null);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [destroyIds, setDestroyIds] = useState<string[] | null>(null);
  const [restoreZipPath, setRestoreZipPath] = useState<string | null>(null);
  const [notebookDelete, setNotebookDelete] = useState<{ id: string; name: string } | null>(null);
  const [tagDelete, setTagDelete] = useState<string | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [historyNoteId, setHistoryNoteId] = useState<string | null>(null);
  const [update, setUpdate] = useState<ReleaseInfo | null>(null);
  const [telescopeOpen, setTelescopeOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const editorViewRef = useRef<EditorView | null>(null);
  const pendingJump = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('devnote:viewmode', viewMode);
    } catch { /* ignore */ }
  }, [viewMode]);

  // System theme tracking for 'system' mode.
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  const theme = getTheme(BUNDLED_THEMES, themeId);
  const dark = resolveIsDark(theme.id, systemDark, BUNDLED_THEMES);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    // Data-driven themes: id for scoping + variables as inline styles.
    // Builtins carry no variables, so :root/.dark CSS defaults apply.
    root.dataset.theme = theme.id;
    for (const key of THEME_VAR_KEYS) {
      const value = theme.variables?.[key];
      if (value) root.style.setProperty(key, value);
      else root.style.removeProperty(key);
    }
  }, [dark, theme]);

  // Frameless Tauri window: flag <html> so CSS keeps the WebView transparent
  // and the App root clips to the native macOS corner radius.
  const inTauri = isTauri();
  useEffect(() => {
    if (inTauri) document.documentElement.classList.add('tauri');
    else document.documentElement.classList.remove('tauri');
  }, [inTauri]);

  const toggleTheme = () => {
    updateSettings({ theme: dark ? 'light' : 'dark' });
  };

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => dismissNotice({ notice: null }), 6000);
    return () => clearTimeout(t);
  }, [notice, dismissNotice]);

  // Reset selection if its notebook was deleted.
  useEffect(() => {
    if (selection.kind === 'notebook') {
      const id = selection.id;
      if (!notebooks.some((n) => n.id === id)) select({ kind: 'all' });
    }
  }, [notebooks, selection, select]);

  // Global shortcuts + idle snapshots — stable actions, fresh state via api (AGENTS.md §5).  // Fresh modal flags for the mount-once key handler below.
  const uiRef = useRef({ templatePickerOpen, telescopeOpen, historyNoteId, prefsOpen, restoreIds, moveIds, destroyIds, notebookDelete, tagDelete, updateOpen: update !== null });
  uiRef.current = { templatePickerOpen, telescopeOpen, historyNoteId, prefsOpen, restoreIds, moveIds, destroyIds, notebookDelete, tagDelete, updateOpen: update !== null };
  // Idle revision snapshots (30s quiet) — cheap dirty-check inside.
  useEffect(() => {
    const t = setInterval(() => api.getState().snapshotIdle(), 10_000);
    return () => clearInterval(t);
  }, [api]);
  // Initialize sync state on mount (mirror/git are desktop-only; silent in browser).
  useEffect(() => {
    void api.getState().refreshSyncState();
  }, [api]);
  // Global error hooks: surface async failures as toasts instead of silent loss.
  useEffect(() => {
    const report = (message: string) => {
      try {
        localStorage.setItem('devnote:last-error', `${new Date().toISOString()} ${message.slice(0, 500)}`);
      } catch { /* ignore */ }
      api.getState().patch({ notice: `Error: ${message.slice(0, 160)}` });
    };
    const onError = (e: ErrorEvent) => {
      if (e.message) report(e.message);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      report(e.reason instanceof Error ? e.reason.message : String(e.reason));
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  // Update-available notice: GitHub Releases check, max once/day, silent offline.
  useEffect(() => {
    let cancelled = false;
    try {
      const raw = localStorage.getItem('devnote:last-update-check');
      if (!shouldRecheck(raw === null ? null : Number(raw))) return;
      void checkForUpdates(APP_VERSION, UPDATE_OWNER, UPDATE_REPO).then((rel) => {
        try { localStorage.setItem('devnote:last-update-check', String(Date.now())); } catch { /* ignore */ }
        if (cancelled || !rel) return;
        try {
          if (localStorage.getItem('devnote:update-dismissed') === rel.tag) return;
        } catch { /* ignore */ }
        setUpdate(rel);
      });
    } catch { /* privacy mode — never nag */ }
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // CodeMirror consumes its own keys (mod+B/I/…): never double-handle.
      if (e.defaultPrevented) return;
      const s = api.getState();
      const typing = isTypingTarget(e.target);
      const mod = isMod(e);

      if (mod && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        s.newNote();
        return;
      }
      // NOTE: `!e.shiftKey` matters — Shift+D yields e.key 'D' and would
      // otherwise swallow the focus-mode chord below (same for N).
      if (mod && !e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        const ids = s.selectedIds.length > 0 ? s.selectedIds : s.activeNoteId !== null ? [s.activeNoteId] : [];
        if (ids.length > 0) s.duplicate(ids);
        return;
      }
      if (mod && e.key === 'Backspace' && !typing) {
        e.preventDefault();
        const ids = s.selectedIds.length > 0 ? s.selectedIds : s.activeNoteId !== null ? [s.activeNoteId] : [];
        if (ids.length > 0) s.trash(ids);
        return;
      }
      if (mod && e.key === '[') {
        e.preventDefault();
        s.goBack();
        return;
      }
      if (mod && e.key === ']') {
        e.preventDefault();
        s.goForward();
        return;
      }
      if (mod && e.key === '/' ) {
        e.preventDefault();
        setSidebarOpen((v) => !v);
        return;
      }
      if (mod && !e.shiftKey && e.key === '\\') {
        e.preventDefault();
        setListOpen((v) => !v);
        return;
      }
      if (mod && !e.shiftKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        setViewMode((m) => (m === 'preview' ? 'edit' : 'preview'));
        return;
      }
      if (mod && !e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setViewMode((m) => (m === 'split' ? 'edit' : 'split'));
        return;
      }
      if (mod && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        setFocusMode((v) => !v);
        return;
      }
      if (mod && !e.shiftKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        setTemplatePickerOpen(true);
        return;
      }
      if (mod && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setTelescopeOpen((v) => !v);
        return;
      }
      if (mod && !e.shiftKey && e.key === 'Enter') {
        // Toggle workspace — but never while a dialog owns Enter.
        const ui = uiRef.current;
        if (ui.templatePickerOpen || ui.telescopeOpen || ui.historyNoteId !== null || ui.prefsOpen || ui.restoreIds !== null || ui.destroyIds !== null || ui.notebookDelete !== null || ui.updateOpen) return;
        e.preventDefault();
        s.toggleWorkspace();
        return;
      }
      if (mod && !e.shiftKey && e.key === ',') {
        e.preventDefault();
        setPrefsOpen(true);
        return;
      }
      if (mod && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        document.getElementById('note-search')?.focus();
        return;
      }
      if (mod && e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        void s.syncNow();
        return;
      }
      if (e.key === 'Escape' && !typing) {
        s.patch({ query: '' });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [api]);

  const focusSearch = () => {
    if (selection.kind !== 'all') select({ kind: 'all' });
    document.getElementById('note-search')?.focus();
  };

  const commands = useMemo(() => {
    // Runs read fresh state lazily — this memo only recomputes on cold changes.
    const ids = (): string[] => {
      const s = api.getState();
      if (s.selectedIds.length > 0) return s.selectedIds;
      return s.activeNoteId !== null ? [s.activeNoteId] : [];
    };
    const runs: Record<string, () => void> = {
      'core:new-note': () => api.getState().newNote(),
      'core:new-notebook': () => {
        const s = api.getState();
        s.addNotebook(s.selection.kind === 'notebook' ? s.selection.id : null);
      },
      'core:choose-template': () => setTemplatePickerOpen(true),
      'core:toggle-telescope': () => setTelescopeOpen((v) => !v),
      'core:toggle-preview': () => setViewMode((m) => (m === 'preview' ? 'edit' : 'preview')),
      'core:toggle-side-by-side': () => setViewMode((m) => (m === 'split' ? 'edit' : 'split')),
      'core:distraction-free': () => setFocusMode((v) => !v),
      'core:toggle-sidebar': () => setSidebarOpen((v) => !v),
      'core:toggle-list': () => setListOpen((v) => !v),
      'core:focus-workspace': () => api.getState().toggleWorkspace(),
      'core:exit-workspace': () => api.getState().clearWorkspace(),
      'core:toggle-theme': () => toggleTheme(),
      'core:open-preferences': () => setPrefsOpen(true),
      'core:navigate-back': () => api.getState().goBack(),
      'core:navigate-forward': () => api.getState().goForward(),
      'core:find': () => focusSearch(),
      'core:find-global': () => {
        const s = api.getState();
        if (s.selection.kind !== 'all') s.select({ kind: 'all' });
        s.patch({ scope: 'global' });
        document.getElementById('note-search')?.focus();
      },
      'core:toggle-search-scope': () => api.getState().toggleScope(),
      'core:toggle-pin': () => {
        const s = api.getState();
        const cur = s.notes.find((n) => n.id === s.activeNoteId) ?? null;
        if (cur) s.commitPatch(cur.id, { pinned: !cur.pinned });
      },
      'core:show-history': () => {
        const id = api.getState().activeNoteId;
        if (id !== null) setHistoryNoteId(id);
      },
      'core:duplicate-note': () => { const list = ids(); if (list.length > 0) api.getState().duplicate(list); },
      'core:trash-note': () => { const list = ids(); if (list.length > 0) api.getState().trash(list); },
      'core:sync-now': () => void api.getState().syncNow(),
      'core:export-mirror': () => void api.getState().exportMirror(),
      'core:import-mirror': () => void api.getState().importMirror(),
      'core:check-for-updates': () => void (async () => {
        const rel = await checkForUpdates(APP_VERSION, UPDATE_OWNER, UPDATE_REPO);
        try { localStorage.setItem('devnote:last-update-check', String(Date.now())); } catch { /* ignore */ }
        if (rel) setUpdate(rel);
        else api.getState().patch({ notice: `You're up to date (v${APP_VERSION})` });
      })(),
    };
    // Telescope never lists its own toggle, hides note ops without an active
    // note, and hides exit-workspace outside a workspace (no dead no-ops).
    const NOTE_COMMANDS = new Set(['core:show-history', 'core:duplicate-note', 'core:trash-note', 'core:toggle-pin']);
    return COMMAND_META.filter((m) => {
      if (m.id === 'core:toggle-telescope') return false;
      if (m.id === 'core:exit-workspace' && workspaceId === null) return false;
      if (activeNoteId === null && NOTE_COMMANDS.has(m.id)) return false;
      return true;
    }).map((m) => ({
      id: m.id,
      title: m.title,
      hint: m.binding?.replace('mod', modLabel()),
      run: runs[m.id] ?? (() => undefined),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, workspaceId, activeNoteId]);

  const jumpToPos = (pos: number) => {
    const v = editorViewRef.current;
    if (!v) {
      // Preview-only mode: mount the editor first, jump on the next paint.
      pendingJump.current = pos;
      setViewMode('edit');
      return;
    }
    const line = v.state.doc.lineAt(Math.min(pos, v.state.doc.length));
    v.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
    });
    v.focus();
  };

  useEffect(() => {
    if (pendingJump.current === null) return;
    const v = editorViewRef.current;
    if (!v) return;
    const pos = pendingJump.current;
    pendingJump.current = null;
    const line = v.state.doc.lineAt(Math.min(pos, v.state.doc.length));
    v.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
    });
    v.focus();
  });

  const runTelescopeAction = (a: TelescopeAction) => {
    const s = api.getState();
    switch (a.type) {
      case 'command': {
        commands.find((c) => c.id === a.id)?.run();
        break;
      }
      case 'notebook': {
        if (a.how === 'open') {
          s.select({ kind: 'notebook', id: a.id });
        } else if (a.how === 'focus') {
          s.focusWorkspace(a.id);
        } else if (s.activeNoteId !== null) {
          s.commitPatch(s.activeNoteId, { notebookId: a.id });
          s.patch({ notice: 'Note moved' });
        } else {
          s.patch({ notice: 'No active note to move' });
        }
        break;
      }
      case 'tag': {
        if (a.how === 'filter') {
          s.pickQuery(`tag:${a.tag}`);
        } else {
          const cur = s.notes.find((n) => n.id === s.activeNoteId) ?? null;
          if (cur !== null && !cur.tags.includes(a.tag)) s.commitPatch(cur.id, { tags: [...cur.tags, a.tag] });
        }
        break;
      }
      case 'toc':
        jumpToPos(a.pos);
        break;
      case 'theme':
        s.updateSettings({ theme: a.mode });
        break;
    }
    setTelescopeOpen(false);
  };

  // ---- workspace view: sidebar scopes to one notebook subtree ----
  const workspaceScopeIds = useMemo(
    () => workspaceScopeIdsFor(notebooks, workspaceId),
    [notebooks, workspaceId],
  );

  // Clear a stale workspace whose notebook was deleted.
  const clearWorkspaceStale = useDevnote((s) => s.clearWorkspace);
  useEffect(() => {
    if (workspaceId !== null && workspaceScopeIds === null) clearWorkspaceStale();
  }, [workspaceId, workspaceScopeIds, clearWorkspaceStale]);

  const confirmDestroy = (ids: string[]) => {
    if (ids.length === 0) return;
    setDestroyIds(ids);
  };

  const moveRestore = (targetId: string) => {
    if (restoreIds !== null) restoreNotes(restoreIds, targetId);
    setRestoreIds(null);
  };

  return (
    <MotionConfig reducedMotion="user">
    <div
      className={`flex h-screen flex-col bg-[var(--bg)] text-[var(--fg)] ${
        inTauri ? 'overflow-hidden rounded-[10px] ring-1 ring-black/10 dark:ring-white/10' : ''
      }`}
    >
      {syncState === 'conflict' && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <span className="font-medium">Sync conflict</span>
          <span className="flex-1 opacity-80">Newer <code>updatedAt</code> won; loser saved as a reviewable note.</span>
          {conflictNoteIds.length > 0 && conflictNoteIds[0] !== undefined && (
            <button className="rounded bg-red-100 px-2 py-1 text-xs hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800" onClick={() => openNoteById(conflictNoteIds[0] as string, false)}>
              Review loser{conflictNoteIds.length > 1 ? ` (${conflictNoteIds.length})` : ''}
            </button>
          )}
          <button className="rounded bg-red-100 px-2 py-1 text-xs hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800" onClick={syncNow}>
            Resolve & sync
          </button>
        </div>
      )}
      <div className={`flex min-h-0 flex-1 ${inTauri ? '' : ''}`}>
      {sidebarOpen && !focusMode && (
        <ErrorBoundary name="sidebar">
        <Sidebar
          onDeleteNotebook={(id) => {
            const nb = notebooks.find((n) => n.id === id);
            if (nb) setNotebookDelete({ id: nb.id, name: nb.name });
          }}
          onDeleteTag={(name) => setTagDelete(name)}
          onOpenPreferences={() => setPrefsOpen(true)}
        />
        </ErrorBoundary>
      )}
      {sidebarOpen && !focusMode && listOpen && (
        <PaneResizer
          label="Resize sidebar"
          value={sidebarWidth}
          min={180}
          max={420}
          onChange={(w) => updateSettings({ sidebarWidth: w })}
          onReset={() => updateSettings({ sidebarWidth: 240 })}
        />
      )}

      {!focusMode && (
      <ErrorBoundary name="note list">
      {listOpen ? (
      <NoteList
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onCollapseList={() => setListOpen(false)}
        onOpenTelescope={() => setTelescopeOpen(true)}
        onChooseTemplate={() => setTemplatePickerOpen(true)}
        onRestoreSelected={(ids) => {
          if (ids.length > 0) setRestoreIds(ids);
        }}
        onDeleteSelected={(ids) => confirmDestroy(ids)}
        onMoveSelected={(ids) => {
          if (ids.length > 0) setMoveIds(ids);
        }}
      />
      ) : (
      <div className="flex w-9 shrink-0 flex-col items-center border-r border-[var(--border)] bg-[var(--bg-list)] pt-2">
        <button
          className="focus-ring rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title="Expand note list (mod+\\)"
          aria-label="Expand note list"
          onClick={() => setListOpen(true)}
        >
          <ChevronRight size={16} className="opacity-60" />
        </button>
      </div>
      )}
      </ErrorBoundary>
      )}
      {!focusMode && listOpen && (
        <PaneResizer
          label="Resize note list"
          value={listWidth}
          min={240}
          max={520}
          onChange={(w) => updateSettings({ listWidth: w })}
          onReset={() => updateSettings({ listWidth: 320 })}
        />
      )}

      <ErrorBoundary name="editor">
      <Editor
        dark={dark}
        mode={viewMode}
        onModeChange={setViewMode}
        viewRef={editorViewRef}
        onRequestJump={jumpToPos}
        onChooseTemplate={() => setTemplatePickerOpen(true)}
        onOpenTelescope={() => setTelescopeOpen(true)}
        onOpenHistory={() => { if (activeNoteId !== null) setHistoryNoteId(activeNoteId); }}
        onRestore={(id) => setRestoreIds([id])}
        onDeleteForever={(id) => confirmDestroy([id])}
      />
      </ErrorBoundary>

      {restoreIds !== null && (
        <MoveToNotebookDialog
          notebooks={notebooks}
          count={restoreIds.length}
          onClose={() => setRestoreIds(null)}
          onMove={moveRestore}
        />
      )}

      {moveIds !== null && (
        <MoveToNotebookDialog
          notebooks={notebooks}
          count={moveIds.length}
          onClose={() => setMoveIds(null)}
          onMove={(target) => { moveNotesTo(moveIds, target); setMoveIds(null); }}
        />
      )}

      {destroyIds !== null && (
        <ConfirmDialog
          title="Delete forever?"
          message={`Permanently delete ${destroyIds.length} note${destroyIds.length === 1 ? '' : 's'}? This cannot be undone.`}
          confirmLabel="Delete forever"
          danger
          onConfirm={() => { destroyNotes(destroyIds); setDestroyIds(null); }}
          onClose={() => setDestroyIds(null)}
        />
      )}

      {restoreZipPath !== null && (
        <ConfirmDialog
          title="Restore from backup?"
          message={`Restore overwrites ~/devnote with ${restoreZipPath}. Current notes stay in the app until the next export.`}
          confirmLabel="Restore"
          danger
          onConfirm={() => {
            const path = restoreZipPath;
            setRestoreZipPath(null);
            void (async () => {
              try {
                const { restoreZip } = await import('./lib/sync');
                const count = await restoreZip(path);
                api.getState().patch({ notice: `Restore done: ${count} file${count === 1 ? '' : 's'} written — importing…` });
                await importMirror();
              } catch (e) {
                api.getState().patch({ notice: e instanceof Error ? e.message : 'Restore failed' });
              }
            })();
          }}
          onClose={() => setRestoreZipPath(null)}
        />
      )}

      {notebookDelete !== null && (
        <ConfirmDialog
          title="Delete notebook?"
          message={`Delete notebook "${notebookDelete.name}"? Notes must be moved or trashed first.`}
          confirmLabel="Delete notebook"
          danger
          onConfirm={() => { removeNotebook(notebookDelete.id); setNotebookDelete(null); }}
          onClose={() => setNotebookDelete(null)}
        />
      )}

      {tagDelete !== null && (
        <ConfirmDialog
          title={`Delete tag #${tagDelete}?`}
          message={`Remove #${tagDelete} from all notes? Notes stay; the tag vanishes everywhere.`}
          confirmLabel="Delete tag"
          danger
          onConfirm={() => { deleteTag(tagDelete); setTagDelete(null); }}
          onClose={() => setTagDelete(null)}
        />
      )}

      {update !== null && (
        <ConfirmDialog
          title={`Update available: ${update.name}`}
          message={`DevNote ${update.tag} is out — you're on v${APP_VERSION}. Download from GitHub?`}
          confirmLabel="Download"
          onConfirm={() => {
            // System browser via opener; fall back to a tab if denied.
            void openExternal(update.url).catch(() => window.open(update.url, '_blank', 'noopener'));
            setUpdate(null);
          }}
          onClose={() => { try { localStorage.setItem('devnote:update-dismissed', update.tag); } catch { /* ignore */ } setUpdate(null); }}
        />
      )}

      {historyNoteId !== null && (
        <RevisionHistoryDialog
          noteId={historyNoteId}
          revisions={revisions}
          onRestore={restoreRevision}
          onClose={() => setHistoryNoteId(null)}
        />
      )}

      <AnimatePresence>
        {telescopeOpen && (
          <Telescope
            commands={commands}
            onAction={runTelescopeAction}
            onClose={() => setTelescopeOpen(false)}
          />
        )}
      </AnimatePresence>

      {prefsOpen && (
        <PreferencesDialog
          settings={settings}
          notebooks={notebooks}
          mirrorDir={mirrorDir}
          syncState={syncState}
          remoteUrl={remoteUrl}
          syncBusy={syncBusy}
          onUpdate={updateSettings}
          onExportMirror={() => void exportMirror()}
          onImportMirror={() => void importMirror()}
          onSyncNow={syncNow}
          onSetRemote={async (url) => { try { const { gitSetRemote, gitInit } = await import('./lib/sync'); await gitInit(); await gitSetRemote(url); await refreshSyncState(); } catch { /* non-fatal */ } }}
          onBackupZip={async () => {
            try {
              const { backupZip } = await import('./lib/sync');
              const info = await backupZip();
              api.getState().patch({ notice: `Backup saved: ${info.path} (${info.files} files)` });
            } catch (e) {
              api.getState().patch({ notice: e instanceof Error ? e.message : 'Backup failed' });
            }
          }}
          canPickFiles={isTauri()}
          onRestoreZip={async () => {
            try {
              const { pickBackupFile } = await import('./lib/sync');
              const picked = await pickBackupFile();
              if (picked === null) {
                if (!isTauri()) api.getState().patch({ notice: 'Restore needs the desktop app — browsers cannot read .zip files from disk.' });
                return;
              }
              setRestoreZipPath(picked);
            } catch (e) {
              api.getState().patch({ notice: e instanceof Error ? e.message : 'Restore failed' });
            }
          }}
          onClose={() => setPrefsOpen(false)}
        />
      )}

      {templatePickerOpen && (
        <TemplatePicker
          templates={allTemplates}
          recents={templateRecents}
          onApply={(id) => { applyTemplateToNote(id); setTemplatePickerOpen(false); }}
          onCreate={createTemplate}
          onUpdate={updateTemplate}
          onDelete={deleteTemplate}
          onDuplicate={duplicateTemplate}
          onClose={() => setTemplatePickerOpen(false)}
        />
      )}

      <AnimatePresence>
        {notice !== null && (
          <motion.div
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 12, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 8, x: '-50%' }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed bottom-4 left-1/2 z-50 flex max-w-md items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white shadow-xl dark:bg-zinc-100 dark:text-zinc-900"
          >
            <span className="flex-1">{notice}</span>
            <button className="rounded p-0.5 hover:opacity-70" onClick={() => dismissNotice({ notice: null })} title="Dismiss">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
    </MotionConfig>
  );
}

// Re-export for shortcuts/tests that enumerate command ids (AGENTS.md §5).
export { COMMAND_IDS } from './lib/commands';
