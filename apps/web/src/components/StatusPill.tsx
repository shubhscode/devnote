import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'reicon-react';
import type { NoteStatus } from '@devnote/core';

/** Single source of truth for status colors/labels across sidebar, list, and editor. */
export const STATUS_META: Record<NoteStatus, { label: string; dot: string; pill: string }> = {
  none: {
    label: 'No status',
    dot: 'bg-zinc-400',
    pill: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
  },
  active: {
    label: 'Active',
    dot: 'bg-green-500',
    pill: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  },
  onHold: {
    label: 'On hold',
    dot: 'bg-amber-500',
    pill: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  completed: {
    label: 'Completed',
    dot: 'bg-sky-500',
    pill: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  },
  dropped: {
    label: 'Dropped',
    dot: 'bg-rose-500',
    pill: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  },
};

export const STATUS_ORDER: NoteStatus[] = ['active', 'onHold', 'completed', 'dropped', 'none'];

export function StatusPill({ status }: { status: NoteStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-medium ${m.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

interface SelectProps {
  value: NoteStatus;
  onChange: (s: NoteStatus) => void;
  disabled?: boolean;
}

/** Colored status dropdown for the editor header (native selects can't show colors). */
export function StatusSelect({ value, onChange, disabled }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  const m = STATUS_META[value];
  return (
    <div ref={ref} className="relative">
      <button
        title={`Status: ${m.label}`}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <span className={`h-2 w-2 rounded-full ${m.dot}`} />
        <span className="text-xs">{m.label}</span>
        <ChevronDown size={12} className="opacity-50" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-40 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] py-1 shadow-xl">
          {STATUS_ORDER.map((s) => {
            const mm = STATUS_META[s];
            const current = s === value;
            return (
              <button
                key={s}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${mm.dot}`} />
                <span className="flex-1">{mm.label}</span>
                {current && <Check size={13} className="opacity-70" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
