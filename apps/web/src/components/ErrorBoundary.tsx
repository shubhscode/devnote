import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  /** Pane name shown in the fallback (e.g. "sidebar", "note list", "editor"). */
  name: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Render crash guard: one broken pane shows a fallback instead of white-screening
 * the whole app. Root instance lives in main.tsx; per-pane instances in App.tsx.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    try {
      console.error(`[devnote:${this.props.name}]`, error);
      localStorage.setItem('devnote:last-error', `${new Date().toISOString()} [${this.props.name}] ${error.message}`);
    } catch { /* logging must never throw */ }
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    const isRoot = this.props.name === 'app';
    return (
      <div
        role="alert"
        className={
          isRoot
            ? 'flex h-screen flex-col items-center justify-center gap-3 bg-[var(--bg)] p-8 text-center text-[var(--fg)]'
            : 'flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center'
        }
      >
        <div className="text-sm font-semibold">Something broke in the {this.props.name}</div>
        <div className="max-w-md truncate text-xs opacity-60" title={error.message}>
          {error.message}
        </div>
        <div className="flex gap-2">
          <button
            className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent-fg)] hover:opacity-90"
            onClick={this.reset}
            title={`Retry rendering the ${this.props.name}`}
          >
            Retry
          </button>
          <button
            className="rounded px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => window.location.reload()}
            title="Reload the app (unsaved keystrokes flush on pagehide)"
          >
            Reload app
          </button>
        </div>
        <div className="text-[11px] opacity-50">Notes persist on disk — reload is safe.</div>
      </div>
    );
  }
}
