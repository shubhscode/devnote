import { useMemo } from 'react';
import { Archive, Command, Filter, Global, Magnifier, Pin, Plus, Sidebar as SidebarIcon, Trash } from 'reicon-react';
import { bestSnippet, parseSearch, titleRanges, type Range, type SearchTerm } from '@devnote/core';
import type { Note } from '@devnote/core';
import type { SearchScope } from '../lib/store';
import { StatusPill } from './StatusPill';

interface NoteListProps {
  notes: Note[];
  activeId: string | null;
  selectedIds: string[];
  query: string;
  scope: SearchScope;
  label: string;
  isTrash: boolean;
  exclusionsOnly: boolean;
  sidebarOpen: boolean;
  onQuery: (q: string) => void;
  onToggleScope: () => void;
  onOpenTelescope: () => void;
  onOpen: (id: string, modClick: boolean) => void;
  onNew: () => void;
  onToggleSidebar: () => void;
  onTrashSelected: () => void;
  onRestoreSelected: () => void;
  onDeleteSelected: () => void;
}

/** Render cap — long lists stay fast; the count line shows the total. */
const RENDER_CAP = 200;
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
  note, isActive, isChecked, terms, onOpen,
}: {
  note: Note;
  isActive: boolean;
  isChecked: boolean;
  terms: SearchTerm[];
  onOpen: (id: string, modClick: boolean) => void;
}) => {
  const snip = useMemo(() => bestSnippet(note.body, terms), [note.body, terms]);
  const titleR = useMemo(() => titleRanges(note.title, terms), [note.title, terms]);
  return (
    <div
      onClick={(e) => onOpen(note.id, e.metaKey || e.ctrlKey)}
      className={`note-row-in cursor-default border-b border-[var(--border-soft)] px-3 py-2.5 ${isActive ? 'bg-[var(--accent-soft)]' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'} ${isChecked && !isActive ? 'bg-[var(--accent-soft)]' : ''}`}
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
  const multi = props.selectedIds.length > 1;
  const terms = useMemo(() => parseSearch(props.query), [props.query]);
  const shown = props.notes.slice(0, RENDER_CAP);

  return (
    <section className="flex w-80 flex-col border-r border-[var(--border)] bg-[var(--bg-list)]">
      <div className="flex items-center gap-1.5 border-b border-[var(--border)] p-2">
        <button className="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Toggle sidebar (mod+/)" onClick={props.onToggleSidebar}>
          <SidebarIcon size={16} />
        </button>
        <button className="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Telescope: commands, notebooks, tags (mod+K)" onClick={props.onOpenTelescope}>
          <Command size={16} />
        </button>
        <button
          className="rounded p-1.5 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
          title={props.isTrash ? 'Scope fixed to Trash' : props.scope === 'global' ? 'Global search: all notebooks (click for notebook-only)' : 'Filtering current notebook (click for global search)'}
          onClick={props.onToggleScope}
          disabled={props.isTrash}
        >
          {props.scope === 'global' ? <Global size={16} /> : <Filter size={16} />}
        </button>
        <div className="relative flex-1">
          <Magnifier size={14} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-50" />
          <input
            id="note-search"
            value={props.query}
            onChange={(e) => props.onQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') props.onQuery(''); }}
            placeholder={props.scope === 'global' ? 'Search all notes…' : 'Filter notes…'}
            title="Qualifiers: book: tag: status: title: body: ; &quot;quoted phrase&quot;; -exclusion (no partial-match stemming)"
            className="w-full rounded bg-[var(--bg-sunken)] py-1.5 pl-7 pr-2 text-sm outline-none"
          />
        </div>
        <button className="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="New note (mod+N)" onClick={props.onNew}>
          <Plus size={16} />
        </button>
      </div>

      <div className="border-b border-[var(--border)] px-3 py-1.5 text-xs opacity-60">
        {props.label} · {props.notes.length} note{props.notes.length === 1 ? '' : 's'}
        {props.scope === 'global' && !props.isTrash ? ' · global' : ''}
      </div>

      {props.exclusionsOnly && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Exclusions need a search term — e.g. <code>notes -tag:old</code>
        </div>
      )}

      {multi && (
        <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-1.5 text-sm">
          <span className="text-xs opacity-70">{props.selectedIds.length} selected</span>
          {props.isTrash ? (
            <>
              <button className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700" onClick={props.onRestoreSelected}>
                <Archive size={13} /> Restore…
              </button>
              <button className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-100 dark:hover:bg-red-900" onClick={props.onDeleteSelected}>
                <Trash size={13} /> Delete
              </button>
            </>
          ) : (
            <button className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700" onClick={props.onTrashSelected}>
              <Trash size={13} /> Trash
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {props.notes.length === 0 && !props.exclusionsOnly && (
          <div className="px-4 py-8 text-center text-sm opacity-50">
            No notes here yet.<br />Press <kbd className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">mod+N</kbd> to create one.
          </div>
        )}
        {shown.map((n) => {
          const isActive = n.id === props.activeId;
          const isChecked = props.selectedIds.includes(n.id);
          return (
            <MemoizedNoteRow
              key={n.id}
              note={n}
              isActive={isActive}
              isChecked={isChecked}
              terms={terms}
              onOpen={props.onOpen}
            />
          );
        })}
        {props.notes.length > RENDER_CAP && (
          <div className="px-4 py-2 text-center text-xs opacity-50">
            Showing first {RENDER_CAP} of {props.notes.length} — refine your search
          </div>
        )}
      </div>
    </section>
  );
}
