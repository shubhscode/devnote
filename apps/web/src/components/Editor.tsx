import { useEffect, useRef, useState } from 'react';
import {
  Archive, Copy, Edit as EditIcon, Eye, History,
  Layout, More, Pin, Plus, Trash, X,
} from 'reicon-react';
import { notebookPath } from '@devnote/core';
import type { Note, Notebook, NoteStatus } from '@devnote/core';
import type { EditorView } from '@devnote/editor';
import type { MutableRefObject } from 'react';
import { StatusSelect } from './StatusPill';
import EditorBubbleMenu from './EditorBubbleMenu';
import CodeEditor from './CodeEditor';
import { Suspense, lazy } from 'react';

// Preview stack (unified + lowlight) is heavy — split into its own chunk,
// loaded on demand in preview/split modes.
const PreviewView = lazy(() => import('./PreviewView'));

export type ViewMode = 'edit' | 'preview' | 'split';

interface EditorProps {
  note: Note | null;
  notebooks: Notebook[];
  tagSuggestions: string[];
  dark: boolean;
  mode: ViewMode;
  onModeChange: (m: ViewMode) => void;
  fontSize: number;
  wrap: boolean;
  /** Shared EditorView handle (owned by App — Telescope jumps need it too). */
  viewRef: MutableRefObject<EditorView | null>;
  /** Latest external body write (template/restore); applied to the matching note's view. */
  externalBody: { noteId: string; body: string; seq: number } | null;
  onCommit: (id: string, patch: { title?: string; body?: string; tags?: string[]; status?: NoteStatus; pinned?: boolean }) => void;
  onNew: () => void;
  onChooseTemplate: () => void;
  onOpenHistory: () => void;
  onDuplicate: (id: string) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
}

/**
 * Single source of truth: title/body render straight from the store note and
 * commit on every change. No drafts, no debounce, no flush — note switches
 * can never show stale content. (updatedAt moves per keystroke; the edited
 * note sorts to top like Apple Notes.)
 */
export default function Editor(props: EditorProps) {
  const { note, mode } = props;
  const [tagInput, setTagInput] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const viewRef = props.viewRef;

  // Clear the tag draft when switching notes (local-only state).
  const lastNoteId = useRef(note?.id);
  if (lastNoteId.current !== note?.id) {
    lastNoteId.current = note?.id;
    setTagInput('');
  }

  // Bumped when the CodeMirror view mounts or its selection moves (bubble menu).
  const [, setViewTick] = useState(0);

  // Note menu (history / duplicate / trash) dismiss.
  // NOTE: every hook must stay above the `note === null` early return —
  // trashing the active note flips null/non-null and React requires a stable
  // hook order across renders (crash: "rendered fewer hooks than expected").
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen ]);

  if (note === null) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 opacity-60">
        <p className="text-sm">No note selected</p>
        <button className="flex items-center gap-1.5 rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent-fg)] hover:opacity-90" onClick={props.onNew}>
          <Plus size={15} /> New note
        </button>
      </main>
    );
  }

  const addTag = () => {
    const t = tagInput.trim();
    if (t === '' || note.tags.includes(t)) {
      setTagInput('');
      return;
    }
    props.onCommit(note.id, { tags: [...note.tags, t] });
    setTagInput('');
  };

  const fmtBtn = 'rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800';
  const showEditor = mode === 'edit' || mode === 'split';

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      {note.trashed && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <span className="flex-1">This note is in Trash.</span>
          <button className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-amber-100 dark:hover:bg-amber-900" onClick={() => props.onRestore(note.id)}>
            <Archive size={13} /> Restore…
          </button>
          <button className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-100 dark:hover:bg-red-900" onClick={() => props.onDeleteForever(note.id)}>
            <Trash size={13} /> Delete forever
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-[var(--border)] px-2 py-1.5">
        <span className="truncate px-2 text-xs opacity-50">{notebookPath(props.notebooks, note.notebookId)}</span>
        <span className="ml-auto" />
        <button className={fmtBtn} title={note.pinned ? 'Unpin' : 'Pin to top'} onClick={() => props.onCommit(note.id, { pinned: !note.pinned })}>
          <Pin size={15} weight={note.pinned ? 'Filled' : 'Outline'} className={note.pinned ? 'text-[var(--accent)]' : 'opacity-60'} />
        </button>
        <button className={fmtBtn} title="Editor only (mod+E)" onClick={() => props.onModeChange('edit')}>
          <EditIcon size={15} weight={mode === 'edit' ? 'Filled' : 'Outline'} className="opacity-70" />
        </button>
        <button className={fmtBtn} title="Side by side (mod+P)" onClick={() => props.onModeChange('split')}>
          <Layout size={15} weight={mode === 'split' ? 'Filled' : 'Outline'} className="opacity-70" />
        </button>
        <button className={fmtBtn} title="Preview only (mod+E)" onClick={() => props.onModeChange('preview')}>
          <Eye size={15} weight={mode === 'preview' ? 'Filled' : 'Outline'} className="opacity-70" />
        </button>
        <div ref={menuRef} className="relative">
          <button className={fmtBtn} title="More actions" onClick={() => setMenuOpen((v) => !v)}>
            <More size={15} className="opacity-60" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] py-1 shadow-xl">
              <button
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Revision history"
                onClick={() => { setMenuOpen(false); props.onOpenHistory(); }}
              >
                <History size={14} className="opacity-70" /> Revision history
              </button>
              <button
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Duplicate (mod+D)"
                onClick={() => { setMenuOpen(false); props.onDuplicate(note.id); }}
              >
                <Copy size={14} className="opacity-70" /> Duplicate
              </button>
              {!note.trashed && (
                <button
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  title="Move to trash (mod+Backspace)"
                  onClick={() => { setMenuOpen(false); props.onTrash(note.id); }}
                >
                  <Trash size={14} className="opacity-70" /> Move to trash
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <input
        value={note.title}
        onChange={(e) => props.onCommit(note.id, { title: e.target.value })}
        placeholder="Untitled"
        disabled={note.trashed}
        className="border-b border-[var(--border)] bg-transparent px-4 py-3 text-lg font-semibold outline-none"
      />

      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] px-4 py-2">
        <StatusSelect
          value={note.status}
          onChange={(s) => props.onCommit(note.id, { status: s })}
          disabled={note.trashed}
        />
        {note.tags.map((t) => (
          <span key={t} className="flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs text-[var(--accent)]">
            #{t}
            {!note.trashed && (
              <button title={`Remove ${t}`} onClick={() => props.onCommit(note.id, { tags: note.tags.filter((x) => x !== t) })}>
                <X size={12} />
              </button>
            )}
          </span>
        ))}
        {!note.trashed && (
          <span className="flex items-center">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              onBlur={addTag}
              list="tag-suggestions"
              placeholder={note.tags.length === 0 ? 'Add tags…' : '+ tag'}
              className="w-28 bg-transparent px-1 py-0.5 text-xs outline-none"
            />
            <datalist id="tag-suggestions">
              {props.tagSuggestions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {showEditor && (
          <div className={`flex min-h-0 flex-col px-4 py-1 ${mode === 'split' ? 'w-1/2 border-r border-[var(--border)]' : 'flex-1'}`}>
            {note.title === '' && note.body === '' && !note.trashed && (
              <button
                onClick={props.onChooseTemplate}
                className="mx-auto mb-1 mt-2 rounded-full bg-zinc-100 px-3 py-1 text-xs opacity-70 hover:opacity-100 dark:bg-zinc-800"
                title="Start from a template (mod+T)"
              >
                Choose a template
              </button>
            )}
            <div className="min-h-0 flex-1 overflow-auto">
            <CodeEditor
              docKey={note.id}
              initialDoc={note.body}
              external={props.externalBody?.noteId === note.id ? props.externalBody : null}
              dark={props.dark}
              fontSize={props.fontSize}
              wrap={props.wrap}
              onDocChange={(doc) => {
                if (doc !== note.body) props.onCommit(note.id, { body: doc });
              }}
              viewRef={viewRef}
              onReady={() => setViewTick((t) => t + 1)}
              onSelectionChange={() => setViewTick((t) => t + 1)}
            />
            </div>
            <EditorBubbleMenu
              viewRef={viewRef}
              active={showEditor && !note.trashed}
              onAction={(fn) => {
                const v = viewRef.current;
                if (v) fn(v);
              }}
            />
          </div>
        )}
        {(mode === 'preview' || mode === 'split') && (
          <div className={`min-h-0 overflow-y-auto px-5 py-3 ${mode === 'split' ? 'w-1/2' : 'flex-1'}`}>
            <Suspense fallback={<div className="py-8 text-center text-sm opacity-50">Rendering preview…</div>}>
              <PreviewView markdown={note.body} />
            </Suspense>
          </div>
        )}
      </div>
    </main>
  );
}
