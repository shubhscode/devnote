import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, Copy, Edit as EditIcon, Eye, History,
  Layout, More, Pin, Plus, Trash, X,
} from 'reicon-react';
import { allTags, backlinksFor, BUNDLED_THEMES, getTheme, notebookPath, noteFilename, noteToMarkdown, resolveWikilink, wordStats } from '@devnote/core';
import type { EditorView } from '@devnote/editor';
import { EditorView as CMView, extractToc, setLinkTitles } from '@devnote/editor';
import type { MutableRefObject } from 'react';
import { exportHtmlDoc, setTaskChecked } from '@devnote/preview';
import { useDevnote } from '../lib/store';
import { StatusSelect } from './StatusPill';
import EditorBubbleMenu from './EditorBubbleMenu';
import CodeEditor from './CodeEditor';
import { Suspense, lazy } from 'react';

// Preview stack (unified + lowlight) is heavy — split into its own chunk,
// loaded on demand in preview/split modes.
const PreviewView = lazy(() => import('./PreviewView'));

export type ViewMode = 'edit' | 'preview' | 'split';

interface EditorProps {
  dark: boolean;
  mode: ViewMode;
  onModeChange: (m: ViewMode) => void;
  /** Shared EditorView handle (owned by App — Telescope jumps need it too). */
  viewRef: MutableRefObject<EditorView | null>;
  /** Jump when no editor view is mounted (preview-only mode) — App mounts it. */
  onRequestJump: (pos: number) => void;
  onChooseTemplate: () => void;
  onOpenHistory: () => void;
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
  // Self-subscribed (Track 1.1): the note object is referentially stable
  // across unrelated store changes, so sidebar/search typing never
  // re-renders this pane.
  const note = useDevnote((s) => s.notes.find((n) => n.id === s.activeNoteId) ?? null);
  const notebooks = useDevnote((s) => s.notebooks);
  const fontSize = useDevnote((s) => s.settings.fontSize);
  const wrap = useDevnote((s) => s.settings.wordWrap);
  const externalBody = useDevnote((s) => s.externalBodyWrite);
  const commitPatch = useDevnote((s) => s.commitPatch);
  const commitBodyExternal = useDevnote((s) => s.commitBodyExternal);
  const newNote = useDevnote((s) => s.newNote);
  const duplicateNote = useDevnote((s) => s.duplicate);
  const trashNote = useDevnote((s) => s.trash);
  const themeId = useDevnote((s) => s.settings.theme);
  const openNoteById = useDevnote((s) => s.openNote);
  const patchNotice = useDevnote((s) => s.patch);
  const notesForTags = useDevnote((s) => s.notes);
  const tagSuggestions = useMemo(
    () => allTags(notesForTags).filter((t) => !(note?.tags.includes(t) ?? false)),
    [notesForTags, note],
  );
  // Feed the editor's [[ title registry (completer reads it synchronously).
  const linkTitles = useMemo(() => {
    const out: string[] = [];
    for (const n of notesForTags) {
      if (!n.trashed && n.title.trim() !== '') out.push(n.title);
    }
    return out;
  }, [notesForTags]);
  useEffect(() => {
    setLinkTitles(linkTitles);
  }, [linkTitles]);
  const backlinks = useMemo(
    () => (note === null ? [] : backlinksFor(note.id, notesForTags)),
    [note, notesForTags],
  );
  const [linksOpen, setLinksOpen] = useState(false);
  const stats = useMemo(() => wordStats(note?.body ?? ''), [note]);
  const headings = useMemo(
    () => extractToc(note?.body ?? '').filter((e) => e.kind === 'heading'),
    [note],
  );
  const [outlineOpen, setOutlineOpen] = useState(false);
  const { mode } = props;
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
        <button className="flex items-center gap-1.5 rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent-fg)] hover:opacity-90" onClick={newNote}>
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
    commitPatch(note.id, { tags: [...note.tags, t] });
    setTagInput('');
  };

  const jumpToPos = (pos: number) => {
    const v = viewRef.current;
    if (!v) {
      props.onRequestJump(pos);
      return;
    }
    const line = v.state.doc.lineAt(Math.min(pos, v.state.doc.length));
    v.dispatch({
      selection: { anchor: line.from },
      effects: CMView.scrollIntoView(line.from, { y: 'center' }),
    });
    v.focus();
    setOutlineOpen(false);
  };

  const toggleTask = (index: number, checked: boolean) => {
    commitBodyExternal(note.id, setTaskChecked(note.body, index, checked));
  };

  const jumpToHeading = (headingIndex: number) => {
    const entry = headings[headingIndex];
    if (entry) jumpToPos(entry.pos);
  };

  const openWikiLink = (target: string) => {
    const hit = resolveWikilink(target, notesForTags);
    if (hit) openNoteById(hit.id, false);
    else patchNotice({ notice: `No note titled "${target}"` });
  };

  const download = (filename: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportMarkdown = () => {
    download(noteFilename(note), noteToMarkdown(note, notebooks), 'text/markdown');
  };

  const exportHtml = () => {
    const theme = getTheme(BUNDLED_THEMES, themeId);
    const base = noteFilename(note).replace(/\.md$/, '');
    download(`${base}.html`, exportHtmlDoc(note.title, note.body, { variables: theme.variables }), 'text/html');
  };

  const printPdf = () => {
    const theme = getTheme(BUNDLED_THEMES, themeId);
    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    frame.srcdoc = exportHtmlDoc(note.title, note.body, { variables: theme.variables });
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 1000);
    };
    document.body.appendChild(frame);
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
        <span className="truncate px-2 text-xs opacity-50">{notebookPath(notebooks, note.notebookId)}</span>
        <span className="ml-auto" />
        <button className={fmtBtn} title={note.pinned ? 'Unpin' : 'Pin to top'} onClick={() => commitPatch(note.id, { pinned: !note.pinned })}>
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
        <div className="relative">
          <button
            className={`${fmtBtn} px-2 text-xs ${outlineOpen ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
            title="Table of contents outline"
            onClick={() => setOutlineOpen((v) => !v)}
          >
            Outline
          </button>
          {outlineOpen && (
            <div className="absolute right-0 z-30 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] py-1 shadow-xl">
              {headings.length === 0 && (
                <div className="px-2.5 py-1.5 text-xs opacity-50">No headings yet</div>
              )}
              {headings.map((h, i) => (
                <button
                  key={`${h.pos}-${i}`}
                  className="block w-full truncate px-2.5 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  style={{ paddingLeft: `${10 + (h.level ?? 1) * 10}px` }}
                  title={h.text}
                  onClick={() => jumpToHeading(i)}
                >
                  {h.text}
                </button>
              ))}
            </div>
          )}
        </div>
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
                onClick={() => { setMenuOpen(false); duplicateNote([note.id]); }}
              >
                <Copy size={14} className="opacity-70" /> Duplicate
              </button>
              {!note.trashed && (
                <button
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  title="Move to trash (mod+Backspace)"
                  onClick={() => { setMenuOpen(false); trashNote([note.id]); }}
                >
                  <Trash size={14} className="opacity-70" /> Move to trash
                </button>
              )}
              <div className="mx-2 my-1 border-t border-[var(--border)]" />
              <button
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Download as Markdown (reimportable)"
                onClick={() => { setMenuOpen(false); exportMarkdown(); }}
              >
                <Copy size={14} className="opacity-70" /> Export Markdown
              </button>
              <button
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Download as styled HTML"
                onClick={() => { setMenuOpen(false); exportHtml(); }}
              >
                <Copy size={14} className="opacity-70" /> Export HTML
              </button>
              <button
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Print or save as PDF"
                onClick={() => { setMenuOpen(false); printPdf(); }}
              >
                <Copy size={14} className="opacity-70" /> Print / PDF
              </button>
            </div>
          )}
        </div>
      </div>

      <input
        value={note.title}
        onChange={(e) => commitPatch(note.id, { title: e.target.value })}
        placeholder="Untitled"
        disabled={note.trashed}
        className="border-b border-[var(--border)] bg-transparent px-4 py-3 text-lg font-semibold outline-none"
      />

      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] px-4 py-2">
        <StatusSelect
          value={note.status}
          onChange={(s) => commitPatch(note.id, { status: s })}
          disabled={note.trashed}
        />
        {note.tags.map((t) => (
          <span key={t} className="flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs text-[var(--accent)]">
            #{t}
            {!note.trashed && (
              <button title={`Remove ${t}`} onClick={() => commitPatch(note.id, { tags: note.tags.filter((x) => x !== t) })}>
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
              {tagSuggestions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-[var(--border)] px-4 py-1.5">
        <button
          className="rounded px-1 py-0.5 text-xs opacity-60 hover:opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title={backlinks.length === 0 ? 'No notes link here yet — reference this note with [[title]]' : 'Notes linking here'}
          onClick={() => setLinksOpen((v) => !v)}
        >
          Linked from · {backlinks.length}
        </button>
      </div>
      {linksOpen && backlinks.length > 0 && (
        <div className="border-b border-[var(--border)] px-4 py-1">
          {backlinks.map((b) => (
            <button
              key={b.noteId}
              className="block w-full truncate rounded px-1 py-1 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title={`Open ${b.title} (${b.count} link${b.count === 1 ? '' : 's'})`}
              onClick={() => openNoteById(b.noteId, false)}
            >
              {b.title === '' ? 'Untitled' : b.title}
              <span className="opacity-50"> · {b.count}</span>
            </button>
          ))}
        </div>
      )}

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
              external={externalBody?.noteId === note.id ? externalBody : null}
              dark={props.dark}
              fontSize={fontSize}
              wrap={wrap}
              onDocChange={(doc) => {
                if (doc !== note.body) commitPatch(note.id, { body: doc });
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
              <PreviewView markdown={note.body} onTaskToggle={toggleTask} onHeadingClick={jumpToHeading} onWikiLink={openWikiLink} />
            </Suspense>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-[var(--border)] px-4 py-1 text-[11px] opacity-60">
        <span title="Word count (fenced code excluded)">{stats.words} words</span>
        <span>{stats.chars} chars</span>
        <span>~{stats.readingMinutes < 1 ? '<1' : stats.readingMinutes} min read</span>
      </div>
    </main>
  );
}
