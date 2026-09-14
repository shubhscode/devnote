import { useEffect, useRef, useState } from 'react';
import { More } from 'reicon-react';

export interface RowMenuItem {
  /** Stable accessible name (also the tooltip). */
  title: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface RowMenuProps {
  /** e.g. `Actions for Inbox`. */
  label: string;
  items: RowMenuItem[];
  align?: 'left' | 'right';
}

/**
 * Always-visible `…` row menu. Replaces hover-only action clusters so touch,
 * keyboard, and first-time users can reach every row action. Full menu
 * keyboard support: arrows/Home/End move, Enter selects, Esc closes and
 * refocuses the trigger, Tab closes.
 */
export default function RowMenu({ label, items, align = 'right' }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Keyboard-opened menus move focus inside; mouse-opened menus keep focus
  // on the trigger (less jarring, still fully tab-reachable).
  const focusOnOpen = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    if (focusOnOpen.current) {
      focusOnOpen.current = false;
      const first = itemRefs.current.find((b) => b && !b.disabled);
      first?.focus();
    }
    return () => document.removeEventListener('mousedown', onDown);
  }, [open ]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  };

  const onItemKey = (e: React.KeyboardEvent, index: number) => {
    const enabled = items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => !it.disabled);
    if (enabled.length === 0) return;
    const at = enabled.findIndex(({ i }) => i === index);
    const move = (next: number) => {
      const target = enabled[(next + enabled.length) % enabled.length]!;
      itemRefs.current[target.i]?.focus();
    };
    if (e.key === 'ArrowDown') { e.preventDefault(); move(at + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(at - 1); }
    else if (e.key === 'Home') { e.preventDefault(); move(0); }
    else if (e.key === 'End') { e.preventDefault(); move(enabled.length - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') { close(false); }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') && !open) {
            e.preventDefault();
            focusOnOpen.current = true;
            setOpen(true);
          } else if (e.key === 'Escape' && open) {
            e.preventDefault();
            close(true);
          }
        }}
        className="focus-ring rounded p-0.5 opacity-0 hover:bg-zinc-200 hover:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 dark:hover:bg-zinc-700"
      >
        <More size={13} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={`absolute top-full z-30 mt-1 min-w-44 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] py-1 shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {items.map((item, i) => (
            <button
              key={item.title}
              ref={(el) => { itemRefs.current[i] = el; }}
              type="button"
              role="menuitem"
              title={item.title}
              disabled={item.disabled}
              onClick={() => { close(true); item.onSelect(); }}
              onKeyDown={(e) => onItemKey(e, i)}
              className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs disabled:opacity-40 ${
                item.danger
                  ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950'
                  : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {item.icon && <span className="shrink-0 opacity-70">{item.icon}</span>}
              <span className="flex-1">{item.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
