import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Hashtag, Moon, Notebook as NotebookIcon, Sun } from 'reicon-react';
import { BUNDLED_THEMES, countDirectNotes, fuzzyFilter, notebookPath } from '@devnote/core';
import { extractToc } from '@devnote/editor';
import { TELESCOPE_SCOPES as SCOPES, parseTelescopeQuery, scopePrefix, type TelescopeScope } from '../lib/telescope';
import { tagCountsFor, useDevnote, workspaceScopeIdsFor } from '../lib/store';
import { useFocusTrap } from '../lib/focusTrap';

export interface TelescopeCommand {
  id: string;
  title: string;
  hint?: string;
}

export interface TelescopeNotebook {
  id: string;
  path: string;
  count: number;
}

export interface TelescopeTag {
  tag: string;
  count: number;
}

export type TelescopeAction =
  | { type: 'command'; id: string }
  | { type: 'notebook'; id: string; how: 'open' | 'move' | 'focus' }
  | { type: 'tag'; tag: string; how: 'filter' | 'add' }
  | { type: 'toc'; pos: number }
  | { type: 'theme'; mode: string };

type Scope = TelescopeScope;

interface Props {
  commands: TelescopeCommand[];
  onAction: (a: TelescopeAction) => void;
  onClose: () => void;
}

interface Row {
  key: string;
  group: string;
  label: string;
  sub?: string;
  hint?: string;
  indices: number[];
  action: TelescopeAction;
  altAction?: TelescopeAction;
  altHint?: string;
  modAction?: TelescopeAction;
  modHint?: string;
}

/** Char-level fuzzy highlight. */
function FuzzyText({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>;
  const set = new Set(indices);
  return (
    <>
      {text.split('').map((ch, i) =>
        set.has(i) ? (
          <mark key={i} className="rounded-sm bg-amber-200 text-inherit dark:bg-amber-800">{ch}</mark>
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
    </>
  );
}

const PER_GROUP = 6;

export default function Telescope(props: Props) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Prefix scoping via parseTelescopeQuery (bare `>` routes to commands;
  // letter prefixes need a space so `budget` still searches everything).
  const { scope, rest } = useMemo(() => parseTelescopeQuery(query), [query]);

  // Self-subscribed (Track 1.1): the palette reads fresh data on open without
  // subscribing its parent to per-keystroke note changes.
  const notebooks = useDevnote((s) => s.notebooks);
  const notes = useDevnote((s) => s.notes);
  const workspaceId = useDevnote((s) => s.workspaceId);
  const activeBody = useDevnote((s) => s.notes.find((n) => n.id === s.activeNoteId)?.body ?? '');
  const hasActiveNote = useDevnote((s) => s.activeNoteId !== null);
  const nbList = useMemo(() => {
    const counts = countDirectNotes(notes);
    return notebooks.map((n) => ({ id: n.id, path: notebookPath(notebooks, n.id), count: counts.get(n.id) ?? 0 }));
  }, [notebooks, notes]);
  const tagList = useMemo(() => {
    const scopeIds = workspaceScopeIdsFor(notebooks, workspaceId);
    const scoped = scopeIds === null ? notes : notes.filter((n) => scopeIds.includes(n.notebookId));
    return tagCountsFor(scoped);
  }, [notes, notebooks, workspaceId]);
  const toc = useMemo(() => extractToc(activeBody), [activeBody]);

  const rows: Row[] = useMemo(() => {
    const cmdRows: Row[] = fuzzyFilter(rest, props.commands, (c) => c.title).map(({ item, hit }) => ({
      key: `cmd-${item.id}`, group: 'Commands', label: item.title, hint: item.hint,
      indices: hit.indices, action: { type: 'command', id: item.id } as TelescopeAction,
    }));
    const nbRows: Row[] = fuzzyFilter(rest, nbList, (n) => n.path).map(({ item, hit }) => ({
      key: `nb-${item.id}`, group: 'Notebooks', label: item.path, sub: `${item.count} notes`,
      indices: hit.indices,
      action: { type: 'notebook', id: item.id, how: 'open' } as TelescopeAction,
      altAction: hasActiveNote ? ({ type: 'notebook', id: item.id, how: 'move' } as TelescopeAction) : undefined,
      altHint: hasActiveNote ? '⇧↵ move note' : undefined,
      modAction: { type: 'notebook', id: item.id, how: 'focus' } as TelescopeAction,
      modHint: '⌘↵ workspace',
    }));
    const tagRows: Row[] = fuzzyFilter(rest, tagList, (t) => t.tag).map(({ item, hit }) => ({
      key: `tag-${item.tag}`, group: 'Tags', label: `#${item.tag}`, sub: `${item.count} notes`,
      indices: hit.indices,
      action: { type: 'tag', tag: item.tag, how: 'filter' } as TelescopeAction,
      altAction: hasActiveNote ? ({ type: 'tag', tag: item.tag, how: 'add' } as TelescopeAction) : undefined,
      altHint: hasActiveNote ? '⇧↵ add to note' : undefined,
    }));
    const tocRows: Row[] = fuzzyFilter(rest, toc, (t) => t.text).map(({ item, hit }) => ({
      key: `toc-${item.pos}`, group: 'Contents',
      label: `${item.kind === 'heading' ? `${'#'.repeat(item.level ?? 1)} ` : item.checked ? '☑ ' : '☐ '}${item.text}`,
      indices: hit.indices, action: { type: 'toc', pos: item.pos } as TelescopeAction,
    }));
    const themeRows: Row[] = fuzzyFilter(rest, BUNDLED_THEMES, (t) => t.name).map(({ item, hit }) => ({
      key: `theme-${item.id}`, group: 'Themes', label: item.name, sub: item.hint,
      indices: hit.indices, action: { type: 'theme', mode: item.id } as TelescopeAction,
    }));
    const byScope: Record<Scope, Row[]> = {
      commands: cmdRows, notebooks: nbRows, tags: tagRows, toc: tocRows, themes: themeRows,
    };
    if (scope) return byScope[scope].slice(0, 30);
    return [
      ...cmdRows.slice(0, PER_GROUP),
      ...nbRows.slice(0, PER_GROUP),
      ...tagRows.slice(0, PER_GROUP),
      ...tocRows.slice(0, PER_GROUP),
      ...themeRows.slice(0, PER_GROUP),
    ];
  }, [scope, rest, props]);

  useEffect(() => {
    setIndex(0);
  }, [query, scope]);

  useEffect(() => {
    document.getElementById(`tsc-row-${index}`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const runRow = (row: Row, mod: 'none' | 'shift' | 'cmd') => {
    const action = mod === 'cmd' && row.modAction ? row.modAction
      : mod === 'shift' && row.altAction ? row.altAction
      : row.action;
    props.onAction(action);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setIndex(0); }
    else if (e.key === 'End') { e.preventDefault(); setIndex(rows.length - 1); }
    else if (e.key === 'Enter' && e.target === inputRef.current) {
      e.preventDefault();
      const row = rows[index];
      if (row) runRow(row, e.metaKey || e.ctrlKey ? 'cmd' : e.shiftKey ? 'shift' : 'none');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      // Layered: filter → scope list → all sources → close.
      if (scope && rest !== '') setQuery(scopePrefix(scope));
      else if (query !== '') setQuery('');
      else props.onClose();
    }
  };

  const unscope = () => setQuery('');

  const scopedMeta = scope ? SCOPES.find((s) => s.id === scope) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]"
      onClick={props.onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -4 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        aria-label="Telescope"
        ref={panelRef}
        onKeyDown={onKey}
        className="flex max-h-[60vh] w-[560px] max-w-[92vw] flex-col overflow-hidden rounded-lg bg-[var(--bg-raised)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 border-b border-[var(--border)] p-2.5">
          {scope && (
            <button className="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Back to all sources (Esc)" onClick={unscope}>
              <ArrowLeft size={15} />
            </button>
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={scopedMeta ? scopedMeta.placeholder : 'Type to search everything — > commands · b notebooks · t tags · # contents · h themes'}
            className="flex-1 bg-transparent px-1 py-1 text-sm outline-none"
          />
          <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] opacity-60 dark:bg-zinc-800">esc</kbd>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {query === '' && !scope ? (
            <div>
              {SCOPES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setQuery(`${s.prefix} `)}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <span className="flex-1">{s.label}</span>
                  <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] dark:bg-zinc-800">{s.prefix}</kbd>
                </button>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm opacity-50">No matches</div>
          ) : (
            (() => {
              let lastGroup = '';
              return rows.map((row, i) => {
                const header = row.group !== lastGroup ? row.group : null;
                lastGroup = row.group;
                return (
                  <div key={row.key}>
                    {header && (
                      <div className="px-2.5 pb-0.5 pt-2 text-[11px] font-semibold uppercase opacity-50">{header}</div>
                    )}
                    <div
                      id={`tsc-row-${i}`}
                      onClick={() => runRow(row, 'none')}
                      className={`flex cursor-default items-center gap-2 rounded px-2.5 py-1.5 text-sm ${i === index ? 'bg-[var(--accent-soft)]' : ''}`}
                    >
                      {row.group === 'Notebooks' && <NotebookIcon size={15} className="shrink-0 opacity-60" />}
                      {row.group === 'Tags' && <Hashtag size={15} className="shrink-0 opacity-60" />}
                      {row.group === 'Themes' && (() => {
                        const kind = BUNDLED_THEMES.find((t) => `theme-${t.id}` === row.key)?.kind;
                        if (kind === 'dark') return <Moon size={15} className="shrink-0 opacity-60" />;
                        if (kind === 'light') return <Sun size={15} className="shrink-0 opacity-60" />;
                        return <span className="w-[15px] shrink-0 text-center text-xs opacity-60">◐</span>;
                      })()}
                      <span className="min-w-0 flex-1 truncate">
                        <FuzzyText text={row.label} indices={row.indices} />
                      </span>
                      {row.sub && <span className="shrink-0 text-[11px] opacity-50">{row.sub}</span>}
                      {row.hint && (
                        <kbd className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] opacity-70 dark:bg-zinc-800">{row.hint}</kbd>
                      )}
                    </div>
                  </div>
                );
              });
            })()
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-[var(--border)] px-3 py-1.5 text-[11px] opacity-60">
          <span><kbd className="font-mono">↵</kbd> {rows[index]?.altHint ? 'open' : 'run'}</span>
          {rows[index]?.altHint && <span><kbd className="font-mono">⇧↵</kbd> {rows[index]?.altHint.replace('⇧↵ ', '')}</span>}
          {rows[index]?.modHint && <span><kbd className="font-mono">⌘↵</kbd> {rows[index]?.modHint.replace('⌘↵ ', '')}</span>}
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span className="ml-auto"><kbd className="font-mono">esc</kbd> back</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
