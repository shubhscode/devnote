import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { CloseCircle, Notebook as NotebookIcon } from 'reicon-react';
import { notebookPath } from '@devnote/core';
import type { Notebook as NotebookType } from '@devnote/core';
import { useFocusTrap } from '../lib/focusTrap';

interface Props {
  notebooks: NotebookType[];
  count: number;
  onClose: () => void;
  onMove: (targetNotebookId: string) => void;
}

/** Move-to-Notebook dialog for restoring trashed notes. */
export default function MoveToNotebookDialog(props: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [props]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={props.onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -4 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        ref={panelRef}
        aria-label={`Move ${props.count} note${props.count === 1 ? '' : 's'} to a notebook`}
        className="w-80 rounded-lg bg-[var(--bg-raised)] p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2">
          <h2 className="text-sm font-semibold">
            Move {props.count} note{props.count === 1 ? '' : 's'} to…
          </h2>
          <button className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={props.onClose} title="Close (Esc)">
            <CloseCircle size={16} />
          </button>
        </div>
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {props.notebooks.map((n) => (
            <button
              key={n.id}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => props.onMove(n.id)}
            >
              <NotebookIcon size={15} className="shrink-0 opacity-70" />
              <span className="truncate">{notebookPath(props.notebooks, n.id)}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
