import { useEffect, useRef, useState } from 'react';
import { CloseCircle, History } from 'reicon-react';
import { revisionsForNote } from '@devnote/core';
import type { Revision } from '@devnote/core';
import { useDevnote } from '../lib/store';
import { useFocusTrap } from '../lib/focusTrap';

interface Props {
  noteId: string;
  revisions: Revision[];
  onRestore: (noteId: string, revisionId: string) => void;
  onClose: () => void;
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleString();
}

/** Note revision history: browse snapshots, restore any version. */
export default function RevisionHistoryDialog(props: Props) {
  const list = revisionsForNote(props.revisions, props.noteId);
  const noteTitle = useDevnote((s) => s.notes.find((n) => n.id === props.noteId)?.title ?? '');
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef);
  const [selectedId, setSelectedId] = useState<string | null>(list[0]?.id ?? null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [props]);

  useEffect(() => {
    if (selectedId !== null && !list.some((r) => r.id === selectedId)) {
      setSelectedId(list[0]?.id ?? null);
    }
  }, [list, selectedId]);

  const selected = list.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={props.onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Revision history"
        ref={panelRef}
        className="flex h-[440px] w-[620px] max-w-[92vw] flex-col rounded-lg bg-[var(--bg-raised)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
          <h2 className="truncate text-sm font-semibold">
            History — {noteTitle === '' ? 'Untitled' : noteTitle}
          </h2>
          <button className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={props.onClose} title="Close (Esc)">
            <CloseCircle size={16} />
          </button>
        </div>

        {list.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-8 text-center text-sm opacity-50">
            No revisions yet.<br />Snapshots appear after 30s idle or when you switch notes.
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <div className="w-52 shrink-0 overflow-y-auto border-r border-[var(--border)] p-2">
              {list.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${r.id === selectedId ? 'bg-[var(--accent-soft)]' : ''}`}
                >
                  <div className="font-medium">{ago(r.createdAt)}</div>
                  <div className="truncate text-xs opacity-60">
                    {new Date(r.createdAt).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              {selected !== null && (
                <>
                  <div className="border-b border-[var(--border)] px-4 py-2">
                    <div className="truncate text-sm font-semibold">
                      {selected.title === '' ? 'Untitled' : selected.title}
                    </div>
                    <div className="text-[11px] opacity-50">{new Date(selected.createdAt).toLocaleString()}</div>
                  </div>
                  <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-4 py-2 font-mono text-xs leading-relaxed">
                    {selected.body === '' ? '(empty)' : selected.body}
                  </pre>
                  <div className="flex justify-end border-t border-[var(--border)] px-3 py-2">
                    <button
                      className="flex items-center gap-1.5 rounded bg-[var(--accent)] px-3 py-1.5 text-xs text-[var(--accent-fg)] hover:opacity-90"
                      onClick={() => props.onRestore(props.noteId, selected.id)}
                    >
                      <History size={13} /> Restore this revision
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
