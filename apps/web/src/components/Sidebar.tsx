import { useEffect, useState } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import {
  AddCircle, ArrowCircleRight, ChevronDown, ChevronRight,
  Edit, Hashtag, Layers, Notebook as NotebookIcon, Plus, Refresh, Settings, Trash, X,
} from 'reicon-react';
import { notebookPath } from '@devnote/core';
import type { Notebook, NoteStatus, TreeNode } from '@devnote/core';
import type { Selection } from '../lib/store';
import { STATUS_META } from './StatusPill';
import TrafficLights from './TrafficLights';

interface SidebarProps {
  tree: TreeNode[];
  notebooks: Notebook[];
  counts: Map<string, number>;
  trashedCount: number;
  statusCounts: Record<NoteStatus, number>;
  tagCounts: { tag: string; count: number }[];
  selection: Selection;
  expanded: string[];
  onSelect: (s: Selection) => void;
  onToggleExpand: (id: string) => void;
  onAddNotebook: (parentId: string | null) => string | null;
  onRenameNotebook: (id: string, name: string) => void;
  onDeleteNotebook: (id: string) => void;
  onPickQuery: (query: string) => void;
  onOpenPreferences: () => void;
  /** Workspace root path, or null for the full view. */
  workspacePath: string | null;
  onFocusNotebook: (id: string) => void;
  onExitWorkspace: () => void;
  syncState: string;
  syncBusy: boolean;
  onSyncNow: () => void;
}

export default function Sidebar(props: SidebarProps) {
  const { tree, selection } = props;
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [treeRef, enableTreeAnimations] = useAutoAnimate({ duration: 180, easing: 'ease-out' });
  const [tagsRef, enableTagAnimations] = useAutoAnimate({ duration: 180, easing: 'ease-out' });
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      enableTreeAnimations(false);
      enableTagAnimations(false);
    }
  }, [enableTreeAnimations, enableTagAnimations]);

  const startRename = (id: string, current: string) => {
    setRenamingId(id);
    setDraft(current);
  };

  const commitRename = () => {
    if (renamingId !== null) props.onRenameNotebook(renamingId, draft);
    setRenamingId(null);
  };

  const add = (parentId: string | null) => {
    const id = props.onAddNotebook(parentId);
    if (id !== null) {
      setRenamingId(id);
      setDraft('');
    }
  };

  const remove = (id: string) => {
    props.onDeleteNotebook(id);
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const { notebook } = node;
    const isSelected = selection.kind === 'notebook' && selection.id === notebook.id;
    const isExpanded = props.expanded.includes(notebook.id);
    const hasKids = node.children.length > 0;
    const count = props.counts.get(notebook.id) ?? 0;
    return (
      <div key={notebook.id}>
        <div
          className={`group flex items-center gap-1 rounded px-1.5 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${isSelected ? 'bg-[var(--accent-soft)]' : ''}`}
          style={{ paddingLeft: `${6 + depth * 14}px` }}
          title={notebookPath(props.notebooks, notebook.id)}
        >
          <button
            className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            style={{ visibility: hasKids ? 'visible' : 'hidden' }}
            onClick={() => props.onToggleExpand(notebook.id)}
            title={isExpanded ? 'Collapse (direct notes only)' : 'Expand (show subtree)'}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <button
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => props.onSelect({ kind: 'notebook', id: notebook.id })}
            title={`${notebookPath(props.notebooks, notebook.id)} — Enter: workspace, mod+Enter: toggle`}
            onKeyDown={(e) => {
              // Plain Enter opens the notebook as a workspace.
              // mod+Enter must bubble to the global toggle (see App key handler).
              if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                props.onFocusNotebook(notebook.id);
              }
            }}
          >
            <NotebookIcon size={16} weight={isSelected ? 'Filled' : 'Outline'} className="shrink-0 opacity-70" />
            {renamingId === notebook.id ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenamingId(null);
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                placeholder="Untitled notebook"
                className="w-full rounded bg-[var(--bg-raised)] px-1 py-0.5 text-sm outline-none ring-1 ring-zinc-400"
              />
            ) : (
              <span className="truncate">{notebook.name}</span>
            )}
          </button>
          <span className="rounded-full bg-zinc-100 px-1.5 text-[11px] opacity-70 dark:bg-zinc-800">
            {count}
          </span>
          <span className="hidden items-center group-hover:flex">
            <button className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700" title="Open as workspace (Enter)" onClick={() => props.onFocusNotebook(notebook.id)}>
              <ArrowCircleRight size={13} />
            </button>
            <button className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700" title="New sub-notebook" onClick={() => add(notebook.id)}>
              <Plus size={13} />
            </button>
            <button className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700" title="Rename" onClick={() => startRename(notebook.id, notebook.name)}>
              <Edit size={13} />
            </button>
            <button className="rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-900" title="Delete" onClick={() => remove(notebook.id)}>
              <Trash size={13} />
            </button>
          </span>
        </div>
        {isExpanded && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <aside className="flex w-60 flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--bg-sidebar)]">
      <TrafficLights />
      {props.workspacePath !== null && (
        <div className="flex items-center gap-1.5 border-b border-[var(--border)] bg-[var(--accent-soft)] px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate text-xs" title={props.workspacePath}>
            <span className="font-semibold uppercase opacity-60">Workspace · </span>
            {props.workspacePath}
          </span>
          <button
            className="shrink-0 rounded p-1 hover:bg-[var(--accent-soft)]"
            title="Exit workspace (show all)"
            onClick={props.onExitWorkspace}
          >
            <X size={13} />
          </button>
        </div>
      )}
      <div className="px-2 pt-2">
        <button
          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${selection.kind === 'all' ? 'bg-[var(--accent-soft)]' : ''}`}
          onClick={() => props.onSelect({ kind: 'all' })}
        >
          <Layers size={16} weight={selection.kind === 'all' ? 'Filled' : 'Outline'} className="opacity-70" />
          All Notes
        </button>
      </div>

      <div className="flex items-center justify-between px-3 pb-1 pt-3">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-60">Notebooks</span>
        <button className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="New notebook" onClick={() => add(null)}>
          <AddCircle size={16} />
        </button>
      </div>
      <nav ref={treeRef} className="px-2">{tree.map((n) => renderNode(n, 0))}</nav>

      <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide opacity-60">Statuses</div>
      <div className="space-y-0.5 px-2">
        {(Object.keys(STATUS_META) as NoteStatus[]).map((s) => (
          <button
            key={s}
            className="flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title={`Filter: status:${s}`}
            onClick={() => props.onPickQuery(`status:${s}`)}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_META[s].dot}`} />
            <span className="flex-1 text-left">{STATUS_META[s].label}</span>
            <span className="text-[11px] opacity-60">{props.statusCounts[s]}</span>
          </button>
        ))}
      </div>

      <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide opacity-60">Tags</div>
      <div ref={tagsRef} className="space-y-0.5 px-2 pb-2">
        {props.tagCounts.length === 0 && (
          <div className="px-2 py-1 text-xs opacity-50">No tags yet</div>
        )}
        {props.tagCounts.map(({ tag, count }) => (
          <button
            key={tag}
            className="flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title={`Filter: tag:${tag}`}
            onClick={() => props.onPickQuery(`tag:${tag}`)}
          >
            <Hashtag size={15} className="opacity-70" />
            <span className="flex-1 truncate text-left">{tag}</span>
            <span className="text-[11px] opacity-60">{count}</span>
          </button>
        ))}
      </div>

      <div className="mt-auto space-y-0.5 border-t border-[var(--border)] px-2 py-2">
        {props.syncState !== 'no-git' && props.syncState !== 'no-repo' && (
          <div className="flex items-center gap-2 rounded px-2 py-1 text-xs">
            <span className={`h-2 w-2 shrink-0 rounded-full ${
              props.syncState === 'clean' ? 'bg-green-500' :
              props.syncState === 'conflict' || props.syncState === 'diverged' ? 'bg-red-500' :
              props.syncState === 'ahead' ? 'bg-sky-500' :
              props.syncState === 'behind' ? 'bg-orange-500' :
              'bg-amber-500'
            }`} />
            <span className="flex-1 opacity-70">{
              props.syncState === 'clean' ? 'Synced' :
              props.syncState === 'conflict' ? 'Conflict' :
              props.syncState === 'diverged' ? 'Diverged' :
              props.syncState === 'ahead' ? 'Unpushed' :
              props.syncState === 'behind' ? 'Updates' :
              props.syncState === 'dirty' ? 'Uncommitted' :
              props.syncState
            }</span>
            <button
              className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              title="Sync now"
              disabled={props.syncBusy}
              onClick={props.onSyncNow}
            >
              <Refresh size={12} className={props.syncBusy ? 'animate-spin' : ''} />
            </button>
          </div>
        )}
        <button
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title="Preferences (mod+,)"
          onClick={props.onOpenPreferences}
        >
          <Settings size={16} className="opacity-70" />
          Preferences
        </button>
        <button
          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${selection.kind === 'trash' ? 'bg-[var(--accent-soft)]' : ''}`}
          onClick={() => props.onSelect({ kind: 'trash' })}
        >
          <Trash size={16} weight={selection.kind === 'trash' ? 'Filled' : 'Outline'} className="opacity-70" />
          Trash
          <span className="ml-auto text-[11px] opacity-60">{props.trashedCount}</span>
        </button>
      </div>
    </aside>
  );
}
