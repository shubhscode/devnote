import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle } from 'reicon-react';
import { useFocusTrap } from '../lib/focusTrap';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  /** Danger actions render red and focus Cancel by default. */
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** In-app destructive confirm (window.confirm is unstyled + unreliable in WebViews). */
export default function ConfirmDialog(props: ConfirmDialogProps) {
  const { danger = false } = props;
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef);

  useEffect(() => {
    (danger ? cancelRef : confirmRef).current?.focus();
  }, [danger]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
      else if (e.key === 'Enter' && !danger) {
        e.preventDefault();
        props.onConfirm();
      }
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={props.onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -4 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        role="alertdialog"
        aria-modal="true"
        aria-label={props.title}
        ref={panelRef}
        className="w-96 max-w-full rounded-lg bg-[var(--bg-raised)] p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          {danger && <AlertTriangle size={16} className="shrink-0 text-red-500" />}
          <h2 className="text-sm font-semibold">{props.title}</h2>
        </div>
        <p className="mt-2 text-sm opacity-70">{props.message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelRef}
            className="rounded bg-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            onClick={props.onClose}
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            className={`rounded px-3 py-1.5 text-sm text-white hover:opacity-90 ${danger ? 'bg-red-600' : 'bg-[var(--accent)] text-[var(--accent-fg)]'}`}
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
