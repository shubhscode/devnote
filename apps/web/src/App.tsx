import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'reicon-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { EditorView, extractToc } from '@devnote/editor';
import { BUNDLED_THEMES, THEME_VAR_KEYS, descendantIds, getTheme, notebookPath, resolveIsDark } from '@devnote/core';
import type { NoteStatus, TreeNode } from '@devnote/core';
import { useDevnoteStore } from './lib/store';
import { COMMAND_META } from './lib/commands';
import { APP_VERSION, UPDATE_OWNER, UPDATE_REPO } from './lib/version';
import { checkForUpdates, shouldRecheck, type ReleaseInfo } from './lib/updates';
import { openExternal } from './lib/open';
import { isMod, isTypingTarget, modLabel } from './lib/keys';
import { isTauri } from './lib/mirror';
import Sidebar from './components/Sidebar';
import NoteList from './components/NoteList';
import Editor, { type ViewMode } from './components/Editor';
import MoveToNotebookDialog from './components/MoveToNotebookDialog';
import ConfirmDialog from './components/ConfirmDialog';
import PreferencesDialog from './components/PreferencesDialog';
import RevisionHistoryDialog from './components/RevisionHistoryDialog';
import Telescope, { type TelescopeAction } from './components/Telescope';
import TemplatePicker from './components/TemplatePicker';

// Phase 2 shell: Sidebar | Note list + search | Editor. Icons: reicon-react
// (Outline default, Filled for selected/active). Theme: light/dark/system via `dark` class.

export default function App() {
  const store = useDevnoteStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [focusMode, setFocusMode] = useState(false); // distraction-free: editor only
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('devnote:viewmode');
    return saved === 'preview' || saved === 'split' ? saved : 'edit';
  });
  const [restoreIds, setRestoreIds] = useState<string[] | null>(null);
  const [destroyIds, setDestroyIds] = useState<string[] | null>(null);
  const [notebookDelete, setNotebookDelete] = useState<{ id: string; name: string } | null>(null);
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

  const theme = getTheme(BUNDLED_THEMES, store.settings.theme);
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
    store.updateSettings({ theme: dark ? 'light' : 'dark' });
  };

  useEffect(() => {
    if (!store.notice) return;
    const t = setTimeout(() => store.setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [store.notice]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset selection if its notebook was deleted.
  useEffect(() => {
    if (store.selection.kind === 'notebook') {
      const id = store.selection.id;
      if (!store.notebooks.some((n) => n.id === id)) store.select({ kind: 'all' });
    }
  }, [store.notebooks]); // eslint-disable-line react-hooks/exhaustive-deps

  // Global shortcuts + idle snapshots — single binding via ref to latest store (AGENTS.md §5).
  const ref = useRef(store);
  ref.current = store;
  // Fresh modal flags for the mount-once key handler below.
  const uiRef = useRef({ templatePickerOpen, telescopeOpen, historyNoteId, prefsOpen, restoreIds, destroyIds, notebookDelete, updateOpen: update !== null });
  uiRef.current = { templatePickerOpen, telescopeOpen, historyNoteId, prefsOpen, restoreIds, destroyIds, notebookDelete, updateOpen: update !== null };
  // Idle revision snapshots (30s quiet) — cheap dirty-check inside.
  useEffect(() => {
    const t = setInterval(() => ref.current.snapshotIdle(), 10_000);
    return () => clearInterval(t);
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
      const s = ref.current;
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
        s.setQuery('');
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const toc = useMemo(
    () => extractToc(store.activeNote?.body ?? ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.activeNote?.body],
  );

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

  const focusSearch = () => {
    if (store.selection.kind !== 'all') store.select({ kind: 'all' });
    document.getElementById('note-search')?.focus();
  };

  const commands = useMemo(() => {
    const s = store;
    const ids = (): string[] => {
      if (s.selectedIds.length > 0) return s.selectedIds;
      return s.activeNoteId !== null ? [s.activeNoteId] : [];
    };
    const runs: Record<string, () => void> = {
      'core:new-note': () => s.newNote(),
      'core:new-notebook': () => s.addNotebook(s.selection.kind === 'notebook' ? s.selection.id : null),
      'core:choose-template': () => setTemplatePickerOpen(true),
      'core:toggle-telescope': () => setTelescopeOpen((v) => !v),
      'core:toggle-preview': () => setViewMode((m) => (m === 'preview' ? 'edit' : 'preview')),
      'core:toggle-side-by-side': () => setViewMode((m) => (m === 'split' ? 'edit' : 'split')),
      'core:distraction-free': () => setFocusMode((v) => !v),
      'core:toggle-sidebar': () => setSidebarOpen((v) => !v),
      'core:focus-workspace': () => s.toggleWorkspace(),
      'core:exit-workspace': () => s.clearWorkspace(),
      'core:toggle-theme': () => toggleTheme(),
      'core:open-preferences': () => setPrefsOpen(true),
      'core:navigate-back': () => s.goBack(),
      'core:navigate-forward': () => s.goForward(),
      'core:find': () => focusSearch(),
      'core:find-global': () => { if (s.selection.kind !== 'all') s.select({ kind: 'all' }); s.setScope('global'); document.getElementById('note-search')?.focus(); },
      'core:toggle-search-scope': () => s.toggleScope(),
      'core:toggle-pin': () => { const cur = s.activeNote; if (cur) s.commitPatch(cur.id, { pinned: !cur.pinned }); },
      'core:show-history': () => { if (s.activeNoteId !== null) setHistoryNoteId(s.activeNoteId); },
      'core:duplicate-note': () => { const list = ids(); if (list.length > 0) s.duplicate(list); },
      'core:trash-note': () => { const list = ids(); if (list.length > 0) s.trash(list); },
      'core:sync-now': () => void s.syncNow(),
      'core:export-mirror': () => void s.exportMirror(),
      'core:import-mirror': () => void s.importMirror(),
      'core:check-for-updates': () => void (async () => {
        const rel = await checkForUpdates(APP_VERSION, UPDATE_OWNER, UPDATE_REPO);
        try { localStorage.setItem('devnote:last-update-check', String(Date.now())); } catch { /* ignore */ }
        if (rel) setUpdate(rel);
        else s.setNotice(`You're up to date (v${APP_VERSION})`);
      })(),
    };
    // Telescope never lists its own toggle, hides note ops without an active
    // note, and hides exit-workspace outside a workspace (no dead no-ops).
    const NOTE_COMMANDS = new Set(['core:show-history', 'core:duplicate-note', 'core:trash-note', 'core:toggle-pin']);
    return COMMAND_META.filter((m) => {
      if (m.id === 'core:toggle-telescope') return false;
      if (m.id === 'core:exit-workspace' && s.workspaceId === null) return false;
      if (s.activeNoteId === null && NOTE_COMMANDS.has(m.id)) return false;
      return true;
    }).map((m) => ({
      id: m.id,
      title: m.title,
      hint: m.binding?.replace('mod', modLabel()),
      run: runs[m.id] ?? (() => undefined),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.notes, store.activeNoteId, store.activeNote, store.selectedIds, store.selection, store.workspaceId]);

  const runTelescopeAction = (a: TelescopeAction) => {
    const s = store;
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
          s.setNotice('Note moved');
        } else {
          s.setNotice('No active note to move');
        }
        break;
      }
      case 'tag': {
        if (a.how === 'filter') {
          pickQuery(`tag:${a.tag}`);
        } else if (s.activeNote !== null) {
          const cur = s.activeNote;
          if (!cur.tags.includes(a.tag)) s.commitPatch(cur.id, { tags: [...cur.tags, a.tag] });
        }
        break;
      }
      case 'toc':
        jumpToPos(a.pos);
        break;
      case 'theme':
        store.updateSettings({ theme: a.mode });
        break;
    }
    setTelescopeOpen(false);
  };

  // ---- workspace view: sidebar scopes to one notebook subtree ----
  const workspaceScopeIds = useMemo(() => {
    if (store.workspaceId === null) return null;
    if (!store.notebooks.some((n) => n.id === store.workspaceId)) return null;
    return [store.workspaceId as string, ...descendantIds(store.notebooks, store.workspaceId as string)];
  }, [store.workspaceId, store.notebooks]);

  // Clear a stale workspace whose notebook was deleted.
  const clearWorkspace = store.clearWorkspace;
  useEffect(() => {
    if (store.workspaceId !== null && workspaceScopeIds === null) clearWorkspace();
  }, [store.workspaceId, workspaceScopeIds, clearWorkspace]);

  const workspaceNotes = useMemo(
    () => (workspaceScopeIds === null
      ? store.notes
      : store.notes.filter((n) => (workspaceScopeIds as string[]).includes(n.notebookId))),
    [store.notes, workspaceScopeIds],
  );

  const sidebarTree = useMemo((): TreeNode[] => {
    if (workspaceScopeIds === null) return store.tree;
    const find = (nodes: TreeNode[]): TreeNode | null => {
      for (const n of nodes) {
        if (n.notebook.id === store.workspaceId) return n;
        const hit = find(n.children);
        if (hit) return hit;
      }
      return null;
    };
    return [find(store.tree)].filter((n): n is TreeNode => n !== null);
  }, [store.tree, store.workspaceId, workspaceScopeIds]);

  const workspacePath = store.workspaceId === null
    ? null
    : notebookPath(store.notebooks, store.workspaceId);

  const statusCounts = useMemo(() => {
    const counts = { none: 0, active: 0, onHold: 0, completed: 0, dropped: 0 } as Record<NoteStatus, number>;
    for (const n of workspaceNotes) {
      if (!n.trashed) counts[n.status] += 1;
    }
    return counts;
  }, [workspaceNotes]);

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of workspaceNotes) {
      if (n.trashed) continue;
      for (const t of n.tags) map.set(t, (map.get(t) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => a.tag.localeCompare(b.tag));
  }, [workspaceNotes]);

  const label =
    store.selection.kind === 'all'
      ? 'All Notes'
      : store.selection.kind === 'trash'
        ? 'Trash'
        : notebookPath(store.notebooks, store.selection.id) || 'Notebook';

  const pickQuery = (q: string) => {
    if (store.workspaceId !== null) {
      // Stay in the workspace: filter its notebook locally.
      store.focusWorkspace(store.workspaceId);
    } else if (store.selection.kind !== 'all') {
      store.select({ kind: 'all' });
    }
    store.setQuery(q);
  };

  const activeOrSelected = (): string[] => {
    if (store.selectedIds.length > 0) return store.selectedIds;
    return store.activeNoteId !== null ? [store.activeNoteId] : [];
  };

  const confirmDestroy = (ids: string[]) => {
    if (ids.length === 0) return;
    setDestroyIds(ids);
  };

  const moveRestore = (targetId: string) => {
    if (restoreIds !== null) store.restore(restoreIds, targetId);
    setRestoreIds(null);
  };

  return (
    <MotionConfig reducedMotion="user">
    <div
      className={`flex h-screen flex-col bg-[var(--bg)] text-[var(--fg)] ${
        inTauri ? 'overflow-hidden rounded-[10px] ring-1 ring-black/10 dark:ring-white/10' : ''
      }`}
    >
      {store.syncState === 'conflict' && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <span className="font-medium">Sync conflict</span>
          <span className="flex-1 opacity-80">Newer <code>updatedAt</code> won; loser saved as a reviewable note.</span>
          <button className="rounded bg-red-100 px-2 py-1 text-xs hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800" onClick={store.syncNow}>
            Resolve & sync
          </button>
        </div>
      )}
      <div className={`flex min-h-0 flex-1 ${inTauri ? '' : ''}`}>
      {sidebarOpen && !focusMode && (
        <Sidebar
          tree={sidebarTree}
          notebooks={store.notebooks}
          counts={store.counts}
          trashedCount={store.trashedCount}
          statusCounts={statusCounts}
          tagCounts={tagCounts}
          selection={store.selection}
          expanded={store.expanded}
          workspacePath={workspacePath}
          onSelect={store.select}
          onToggleExpand={store.toggleExpand}
          onAddNotebook={store.addNotebook}
          onRenameNotebook={store.rename}
          onDeleteNotebook={(id) => {
            const nb = store.notebooks.find((n) => n.id === id);
            if (nb) setNotebookDelete({ id: nb.id, name: nb.name });
          }}
          onPickQuery={pickQuery}
          onOpenPreferences={() => setPrefsOpen(true)}
          onFocusNotebook={store.focusWorkspace}
          onExitWorkspace={store.clearWorkspace}
          syncState={store.syncState}
          syncBusy={store.syncBusy}
          onSyncNow={store.syncNow}
        />
      )}

      {!focusMode && (
      <NoteList
        notes={store.visibleNotes}
        activeId={store.activeNoteId}
        selectedIds={store.selectedIds}
        query={store.query}
        scope={store.scope}
        label={label}
        isTrash={store.selection.kind === 'trash'}
        exclusionsOnly={store.exclusionsOnly}
        sidebarOpen={sidebarOpen}
        onQuery={store.setQuery}
        onToggleScope={store.toggleScope}
        onOpenTelescope={() => setTelescopeOpen(true)}
        onOpen={store.openNote}
        onNew={store.newNote}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onTrashSelected={() => store.trash(activeOrSelected())}
        onRestoreSelected={() => {
          const ids = activeOrSelected();
          if (ids.length > 0) setRestoreIds(ids);
        }}
        onDeleteSelected={() => confirmDestroy(activeOrSelected())}
      />
      )}

      <Editor
        note={store.activeNote}
        notebooks={store.notebooks}
        tagSuggestions={store.tags.filter((t) => !(store.activeNote?.tags.includes(t) ?? false))}
        dark={dark}
        mode={viewMode}
        onModeChange={setViewMode}
        viewRef={editorViewRef}
        fontSize={store.settings.fontSize}
        wrap={store.settings.wordWrap}
        externalBody={store.externalBodyWrite}
        onCommit={store.commitPatch}
        onNew={store.newNote}
        onChooseTemplate={() => setTemplatePickerOpen(true)}
        onOpenHistory={() => { if (store.activeNoteId !== null) setHistoryNoteId(store.activeNoteId); }}
        onDuplicate={(id) => store.duplicate([id])}
        onTrash={(id) => store.trash([id])}
        onRestore={(id) => setRestoreIds([id])}
        onDeleteForever={(id) => confirmDestroy([id])}
      />

      {restoreIds !== null && (
        <MoveToNotebookDialog
          notebooks={store.notebooks}
          count={restoreIds.length}
          onClose={() => setRestoreIds(null)}
          onMove={moveRestore}
        />
      )}

      {destroyIds !== null && (
        <ConfirmDialog
          title="Delete forever?"
          message={`Permanently delete ${destroyIds.length} note${destroyIds.length === 1 ? '' : 's'}? This cannot be undone.`}
          confirmLabel="Delete forever"
          danger
          onConfirm={() => { store.destroy(destroyIds); setDestroyIds(null); }}
          onClose={() => setDestroyIds(null)}
        />
      )}

      {notebookDelete !== null && (
        <ConfirmDialog
          title="Delete notebook?"
          message={`Delete notebook "${notebookDelete.name}"? Notes must be moved or trashed first.`}
          confirmLabel="Delete notebook"
          danger
          onConfirm={() => { store.removeNotebook(notebookDelete.id); setNotebookDelete(null); }}
          onClose={() => setNotebookDelete(null)}
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
          noteTitle={store.notes.find((n) => n.id === historyNoteId)?.title ?? ''}
          revisions={store.revisions}
          onRestore={store.restoreRevision}
          onClose={() => setHistoryNoteId(null)}
        />
      )}

      <AnimatePresence>
        {telescopeOpen && (
          <Telescope
            commands={commands}
            notebooks={store.notebooks.map((n) => ({
              id: n.id,
              path: notebookPath(store.notebooks, n.id),
              count: store.counts.get(n.id) ?? 0,
            }))}
            tags={tagCounts}
            toc={toc}
            hasActiveNote={store.activeNote !== null}
            onAction={runTelescopeAction}
            onClose={() => setTelescopeOpen(false)}
          />
        )}
      </AnimatePresence>

      {prefsOpen && (
        <PreferencesDialog
          settings={store.settings}
          notebooks={store.notebooks}
          mirrorDir={store.mirrorDir}
          syncState={store.syncState}
          remoteUrl={store.remoteUrl}
          syncBusy={store.syncBusy}
          onUpdate={store.updateSettings}
          onExportMirror={() => void store.exportMirror()}
          onImportMirror={() => void store.importMirror()}
          onSyncNow={store.syncNow}
          onSetRemote={async (url) => { try { const { gitSetRemote, gitInit } = await import('./lib/sync'); await gitInit(); await gitSetRemote(url); await store.refreshSyncState(); } catch { /* non-fatal */ } }}
          onBackupZip={async () => {
            try {
              const { backupZip } = await import('./lib/sync');
              const info = await backupZip();
              store.setNotice(`Backup saved: ${info.path} (${info.files} files)`);
            } catch (e) {
              store.setNotice(e instanceof Error ? e.message : 'Backup failed');
            }
          }}
          onRestoreZip={async () => {
            try {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.zip';
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                // Tauri can't read browser File directly — use invoke with path
                // For now, show a notice pointing to the zip path
                store.setNotice('Restore: place the zip in ~/devnote-backup.zip and click Restore');
              };
              input.click();
            } catch (e) {
              store.setNotice(e instanceof Error ? e.message : 'Restore failed');
            }
          }}
          onClose={() => setPrefsOpen(false)}
        />
      )}

      {templatePickerOpen && (
        <TemplatePicker
          templates={store.allTemplates}
          recents={store.templateRecents}
          onApply={(id) => { store.applyTemplateToNote(id); setTemplatePickerOpen(false); }}
          onCreate={store.createTemplate}
          onUpdate={store.updateTemplate}
          onDelete={store.deleteTemplate}
          onDuplicate={store.duplicateTemplate}
          onClose={() => setTemplatePickerOpen(false)}
        />
      )}

      <AnimatePresence>
        {store.notice !== null && (
          <motion.div
            initial={{ opacity: 0, y: 12, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 8, x: '-50%' }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed bottom-4 left-1/2 z-50 flex max-w-md items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white shadow-xl dark:bg-zinc-100 dark:text-zinc-900"
          >
            <span className="flex-1">{store.notice}</span>
            <button className="rounded p-0.5 hover:opacity-70" onClick={() => store.setNotice(null)} title="Dismiss">
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
