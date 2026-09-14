import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Archive, ChevronLeft, Command, Copy, Download, Filter, Global, Magnifier, Pin, Plus, Sidebar as SidebarIcon, Trash } from 'reicon-react';
import { NOTE_STATUSES, bestSnippet, isExclusionsOnly, parseSearch, titleRanges, type NoteSortKey, type NoteStatus, type Range, type SearchTerm } from '@devnote/core';
import type { Note } from '@devnote/core';
import { activeOrSelectedIds, computeVisible, labelFor, useDevnote } from '../lib/store';
import { StatusPill, STATUS_META } from './StatusPill';
import EmptyState from './EmptyState';

interface NoteListProps {
  onToggleSidebar: () => void;
  onCollapseList: () => void;
  onOpenTelescope: () => void;
  onChooseTemplate: () => void;
  onRestoreSelected: (ids: string[]) => void;
  onDeleteSelected: (ids: string[]) => void;
  onMoveSelected: (ids: string[]) => void;
}

/** Max tag chips per row before collapsing into +N. */
const TAG_CAP = 3;

/** Text with <mark> highlights for the given ranges. */
export function Marked({ text, ranges }: { text: string; ranges: Range[] }) {
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach((r, i) => {
    const s = Math.max(0, Math.min(r.start, text.length));
    const e = Math.max(s, Math.min(r.end, text.length));
    if (s > at) parts.push(<span key={`t${i}`}>{text.slice(at, s)}</span>);
    parts.push(
      <mark key={`m${i}`} className="rounded-sm bg-amber-200 text-inherit dark:bg-amber-800">
        {text.slice(s, e)}
      </mark>,
    );
    at = e;
  });
  if (at < text.length) parts.push(<span key="tail">{text.slice(at)}</span>);
  return <>{parts}</>;
}

/** Memoized note row — re-renders only when note identity, active, selected, or terms change. */
const NoteRow = ({
  note, isActive, isChecked, terms, onOpen, onRangeSelect,
}: {
  note: Note;
  isActive: boolean;
  isChecked: boolean;
  terms: SearchTerm[];
  onOpen: (id: string, modClick: boolean) => void;
  onRangeSelect: (id: string) => void;
}) => {
  const snip = useMemo(() => bestSnippet(note.body, terms), [note.body, terms]);
  const titleR = useMemo(() => titleRanges(note.title, terms), [note.title, terms]);
  return (
    <div
      onClick={(e) => {
        if (e.shiftKey) onRangeSelect(note.id);
        else onOpen(note.id, e.metaKey || e.ctrlKey);
      }}
      className={`note-row-in cursor-default border-b border-[var(--border-soft)] px-3 py-2.5 transition-colors duration-150 ${isActive ? 'bg-[var(--accent-soft)]' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'} ${isChecked && !isActive ? 'bg-[var(--accent-soft)]' : ''}`}
    >
      <div className="flex items-center gap-1.5">
        {note.pinned && <Pin size={12} weight="Filled" className="shrink-0 opacity-60" />}
        <div className="truncate text-sm font-medium">
          <Marked text={note.title === '' ? 'Untitled' : note.title} ranges={note.title === '' ? [] : titleR} />
        </div>
      </div>
      <div className="truncate text-xs opacity-60">
        <Marked text={snip.text} ranges={snip.ranges} />
      </div>
      {(note.status !== 'none' || note.tags.length > 0) && (
        <div className="flex items-center gap-1 overflow-hidden pt-1">
          {note.status !== 'none' && <StatusPill status={note.status} />}
          {note.tags.slice(0, TAG_CAP).map((t) => (
            <span key={t} className="shrink-0 truncate rounded bg-[var(--accent-soft)] px-1.5 py-px text-[11px] text-[var(--accent)]">
              #{t}
            </span>
          ))}
          {note.tags.length > TAG_CAP && (
            <span className="shrink-0 text-[11px] opacity-50">+{note.tags.length - TAG_CAP}</span>
          )}
        </div>
      )}
    </div>
  );
};
const MemoizedNoteRow = NoteRow;

export default function NoteList(props: NoteListProps) {
  // Self-subscribed (Track 1.1): the 200-row list re-renders on typing, but
  // the sidebar and preview don't — and vice versa.
  const notes = useDevnote((s) => s.notes);
  const notebooks = useDevnote((s) => s.notebooks);
  const selection = useDevnote((s) => s.selection);
  const expanded = useDevnote((s) => s.expanded);
  const activeId = useDevnote((s) => s.activeNoteId);
  const selectedIds = useDevnote((s) => s.selectedIds);
  const query = useDevnote((s) => s.query);
  const scope = useDevnote((s) => s.scope);
  const sortKey = useDevnote((s) => s.settings.noteSort);
  const listWidth = useDevnote((s) => s.settings.listWidth);
  const patch = useDevnote((s) => s.patch);
  const toggleScope = useDevnote((s) => s.toggleScope);
  const setQuery = (q: string) => patch({ query: q });
  const setSelectedIds = (ids: string[]) => patch({ selectedIds: ids });
  const openNote = useDevnote((s) => s.openNote);
  const selectRange = useDevnote((s) => s.selectRange);
  const newNote = useDevnote((s) => s.newNote);
  const trashNotes = useDevnote((s) => s.trash);
  const bulkTag = useDevnote((s) => s.bulkTag);
  const bulkStatus = useDevnote((s) => s.bulkStatus);
  const bulkPin = useDevnote((s) => s.bulkPin);
  const duplicateNotes = useDevnote((s) => s.duplicate);
  const exportNotes = useDevnote((s) => s.exportNotes);
  const updateSettings = useDevnote((s) => s.updateSettings);

  const visible = useMemo(
    () => computeVisible(notes, notebooks, selection, expanded, query, scope, sortKey),
    [notes, notebooks, selection, expanded, query, scope, sortKey],
  );
  const label = useMemo(() => labelFor(selection, notebooks), [selection, notebooks]);
  const isTrash = selection.kind === 'trash';
  const exclusionsOnly = useMemo(() => query.trim() !== '' && isExclusionsOnly(parseSearch(query)), [query]);
  const targets = activeOrSelectedIds(selectedIds, activeId);
  const multi = selectedIds.length > 1;
  const terms = useMemo(() => parseSearch(query), [query]);
  const listRef = useRef<HTMLDivElement>(null);
  // Windowed rendering past any list size: rows measure themselves
  // (variable heights from tags/status), keyed by stable note id.
  const rowVirtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 72,
    getItemKey: (index) => visible[index]!.id,
    overscan: 8,
  });
  const [tagging, setTagging] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const allVisibleSelected = visible.length > 0 && visible.every((n) => selectedIds.includes(n.id));
  const selectedNotes = visible.filter((n) => selectedIds.includes(n.id));
  const allPinned = selectedNotes.length > 0 && selectedNotes.every((n) => n.pinned);

  const commitTag = () => {
    if (tagDraft.trim() !== '') bulkTag(targets, tagDraft.trim());
    setTagDraft('');
    setTagging(false);
  };

  return (
    <section
      style={{ width: listWidth }}
      className="flex shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-list)]"
      onKeyDown={(e) => {
        // Scoped select-all: never steals mod+A from the editor.
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
          setSelectedIds(visible.map((n) => n.id));
        }
      }}
    >
      <div className="flex items-center gap-1.5 border-b border-[var(--border)] p-2">
        <button className="focus-ring rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Toggle sidebar (mod+/)" aria-label="Toggle sidebar" onClick={props.onToggleSidebar}>
          <SidebarIcon size={16} />
        </button>
        <button className="focus-ring rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Telescope: commands, notebooks, tags (mod+K)" aria-label="Open Telescope" onClick={props.onOpenTelescope}>
          <Command size={16} />
        </button>
        <button
          className="focus-ring rounded p-1.5 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
          title={isTrash ? 'Scope fixed to Trash' : scope === 'global' ? 'Global search: all notebooks (click for notebook-only)' : 'Filtering current notebook (click for global search)'}
          aria-label={isTrash ? 'Search scope: Trash (fixed)' : scope === 'global' ? 'Search scope: global (switch to notebook-only)' : 'Search scope: notebook-only (switch to global)'}
          aria-pressed={scope === 'global'}
          onClick={toggleScope}
          disabled={isTrash}
        >
          {scope === 'global' ? <Global size={16} /> : <Filter size={16} />}
        </button>
        <div className="relative flex-1">
          <Magnifier size={14} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-50" />
          <input
            id="note-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
            placeholder={scope === 'global' ? 'Search all notes…' : 'Filter notes…'}
            title="Qualifiers: book: tag: status: title: body: ; &quot;quoted phrase&quot;; -exclusion (no partial-match stemming)"
            className="w-full rounded bg-[var(--bg-sunken)] py-1.5 pl-7 pr-2 text-sm outline-none"
          />
        </div>
        <button className="focus-ring rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="New note (mod+N)" aria-label="New note" onClick={newNote}>
          <Plus size={16} />
        </button>
      </div>

      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-1.5 text-xs">
        <span className="min-w-0 flex-1 truncate opacity-60">
          {label} · {visible.length} note{visible.length === 1 ? '' : 's'}
          {scope === 'global' && !isTrash ? ' · global' : ''}
        </span>
        <button
          className="shrink-0 rounded px-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title={allVisibleSelected ? 'Clear selection' : 'Select all visible (mod+A)'}
          onClick={allVisibleSelected ? () => setSelectedIds([]) : () => setSelectedIds(visible.map((n) => n.id))}
        >
          {allVisibleSelected ? 'Clear' : 'Select all'}
        </button>
        <select
          value={sortKey}
          onChange={(e) => updateSettings({ noteSort: e.target.value as NoteSortKey })}
          title={query.trim() === '' ? 'List order (search results always rank by relevance)' : 'List order (applies when search is clear)'}
          className="shrink-0 rounded bg-transparent py-0.5 outline-none hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <option value="updated">Updated</option>
          <option value="created">Created</option>
          <option value="title">Title</option>
        </select>
        <button
          className="focus-ring shrink-0 rounded p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title="Collapse note list (mod+\\)"
          aria-label="Collapse note list"
          onClick={props.onCollapseList}
        >
          <ChevronLeft size={14} className="opacity-60" />
        </button>
      </div>

      {exclusionsOnly && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Exclusions need a search term — e.g. <code>notes -tag:old</code>
        </div>
      )}

      {multi && (
        <div className="flex flex-wrap items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-1.5 text-sm">
          <span className="mr-auto text-xs opacity-70">{selectedIds.length} selected</span>
          {isTrash ? (
            <>
              <button className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700" onClick={() => props.onRestoreSelected(targets)}>
                <Archive size={13} /> Restore…
              </button>
              <button className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-100 dark:hover:bg-red-900" onClick={() => props.onDeleteSelected(targets)}>
                <Trash size={13} /> Delete
              </button>
            </>
          ) : (
            <>
              <button className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700" title="Move to notebook…" onClick={() => props.onMoveSelected(targets)}>
                <Archive size={13} /> Move…
              </button>
              {tagging ? (
                <input
                  autoFocus
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onBlur={commitTag}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitTag();
                    if (e.key === 'Escape') { setTagDraft(''); setTagging(false); }
                    e.stopPropagation();
                  }}
                  placeholder="Add tag… (Enter)"
                  title="Add tag to selected notes (Enter saves, Esc cancels)"
                  className="w-24 rounded bg-[var(--bg-raised)] px-1.5 py-1 text-xs outline-none ring-1 ring-zinc-400"
                />
              ) : (
                <button className="rounded px-2 py-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700" title="Add tag to selected" onClick={() => setTagging(true)}>
                  #Tag
                </button>
              )}
              <select
                value=""
                onChange={(e) => { if (e.target.value !== '') bulkStatus(targets, e.target.value as NoteStatus); }}
                title="Set status for selected"
                className="max-w-24 rounded bg-transparent px-1 py-1 text-xs outline-none hover:bg-zinc-200 dark:hover:bg-zinc-700"
              >
                <option value="">Status…</option>
                {NOTE_STATUSES.filter((s) => s !== 'none').map((s) => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
                <option value="none">No status</option>
              </select>
              <button
                className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700"
                title={allPinned ? 'Unpin selected' : 'Pin selected to top'}
                onClick={() => bulkPin(targets, !allPinned)}
              >
                <Pin size={13} weight={allPinned ? 'Filled' : 'Outline'} /> {allPinned ? 'Unpin' : 'Pin'}
              </button>
              <button className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700" title="Duplicate selected" onClick={() => duplicateNotes(targets)}>
                <Copy size={13} />
              </button>
              <button className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700" title="Export selected as Markdown files" onClick={() => exportNotes(targets)}>
                <Download size={13} />
              </button>
              <button className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700" onClick={() => trashNotes(targets)}>
                <Trash size={13} /> Trash
              </button>
            </>
          )}
        </div>
      )}

      <div ref={listRef} data-testid="note-list-scroll" className="flex-1 overflow-y-auto">
        {visible.length === 0 && !exclusionsOnly && query.trim() !== '' && (
          <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
            <p className="font-mono text-sm text-[var(--accent)]">// no matches</p>
            <p className="max-w-60 text-sm opacity-60">No notes match “{query.trim()}”. Try fewer qualifiers.</p>
            <button
              onClick={() => setQuery('')}
              className="focus-ring mt-3 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Clear search
            </button>
          </div>
        )}
        {visible.length === 0 && !exclusionsOnly && query.trim() === '' && selection.kind === 'trash' && (
          <div className="px-4 py-8 text-center text-sm opacity-50">
            Trash is empty.<br />Deleted notes land here first.
          </div>
        )}
        {visible.length === 0 && !exclusionsOnly && query.trim() === '' && selection.kind !== 'trash' && (
          <EmptyState
            heading="// no notes yet"
            hint="Start writing, start from a template, or jump anywhere."
            actions={[
              { label: 'New note', kbd: 'mod+N', primary: true, onSelect: () => newNote() },
              { label: 'From template', kbd: 'mod+T', onSelect: () => props.onChooseTemplate() },
              { label: 'Find anything', kbd: 'mod+K', onSelect: () => props.onOpenTelescope() },
            ]}
          />
        )}
        <div style={{ height: rowVirtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((vr) => {
            const n = visible[vr.index]!;
            const isActive = n.id === activeId;
            const isChecked = selectedIds.includes(n.id);
            return (
              <div
                key={vr.key}
                data-index={vr.index}
                ref={rowVirtualizer.measureElement}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vr.start}px)` }}
              >
                <MemoizedNoteRow
                  note={n}
                  isActive={isActive}
                  isChecked={isChecked}
                  terms={terms}
                  onOpen={openNote}
                  onRangeSelect={selectRange}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
