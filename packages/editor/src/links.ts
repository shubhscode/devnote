// Wikilink `[[` completion (2.2). Note titles live in the web store; the
// editor package keeps a registry (`setLinkTitles`) fed by the Editor
// component — the completer itself stays pure over (titles, state).
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { inCodeBlock } from './complete';

let linkTitles: string[] = [];

/** Refresh the title registry (call on notes change; cheap string list). */
export function setLinkTitles(titles: string[]): void {
  linkTitles = titles;
}

export interface LinkRange {
  from: number;
  to: number;
  query: string;
}

/** `[[query` range ending at the cursor (not in code, no close yet). */
export function linkRange(state: EditorState): LinkRange | null {
  const sel = state.selection.main;
  if (!sel.empty) return null;
  const pos = sel.head;
  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  const m = /\[\[([^\[\]]*)$/.exec(before);
  if (!m) return null;
  return { from: pos - (m[1]?.length ?? 0), to: pos, query: m[1] ?? '' };
}

const MAX_OPTIONS = 8;

export function linkCompleter(ctx: CompletionContext): CompletionResult | null {
  const range = linkRange(ctx.state);
  if (!range || inCodeBlock(ctx.state, ctx.pos)) return null;
  const q = range.query.toLowerCase();
  const options = linkTitles
    .filter((t) => t.toLowerCase().includes(q))
    .slice(0, MAX_OPTIONS);
  if (options.length === 0) return null;
  return {
    from: range.from,
    to: range.to,
    filter: false,
    options: options.map((title) => ({
      label: title,
      detail: 'note',
      apply: (view: EditorView) => {
        const insert = `[[${title}]]`;
        // Replace `[[query`, keep the already-typed `[[`.
        view.dispatch({
          changes: { from: range.from - 2, to: range.to, insert },
          selection: { anchor: range.from - 2 + insert.length },
        });
      },
    })),
  };
}
