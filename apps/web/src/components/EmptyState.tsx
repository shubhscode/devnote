interface EmptyAction {
  label: string;
  /** Shortcut hint, e.g. `mod+N`. */
  kbd?: string;
  primary?: boolean;
  onSelect: () => void;
}

interface EmptyStateProps {
  /** Mono, code-flavored heading, e.g. `// no notes yet`. */
  heading: string;
  hint: string;
  actions: EmptyAction[];
}

/**
 * Authored empty state: one confident heading, one hint line, up to three
 * primary actions (New / Template / Telescope). No dead ends.
 */
export default function EmptyState({ heading, hint, actions }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
      <p className="font-mono text-sm text-[var(--accent)]">{heading}</p>
      <p className="max-w-60 text-sm opacity-60">{hint}</p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={a.onSelect}
            title={a.kbd ? `${a.label} (${a.kbd})` : a.label}
            className={`focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
              a.primary
                ? 'bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90'
                : 'border border-[var(--border)] hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            {a.label}
            {a.kbd && (
              <kbd className={`rounded px-1 font-mono text-[11px] ${a.primary ? 'bg-black/20' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
                {a.kbd}
              </kbd>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
