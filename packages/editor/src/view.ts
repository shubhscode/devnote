// CodeMirror 6 setup: Markdown editing, themes, keymaps.
// React wrapper lives in apps/web (CodeEditor.tsx) — this package stays UI-framework-free.
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentLess,
  indentMore,
} from '@codemirror/commands';
import { bracketMatching, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, dropCursor, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { tags as hlTags } from '@lezer/highlight';
import { codeBlockBox } from './codeblock';
import { codeCompleter, inCodeBlock } from './complete';
import { linkCompleter } from './links';
import { insertLink, toggleAlertBlock, toggleFenceBlock, toggleLinePrefix, toggleOrdered, toggleTask, toggleWrap, type AlertKind, type Edit } from './text';
import { filterSlashItems, type SlashItem } from './slash';
import { advanceCell, continueTableRow, isTableRow, type TableEdit } from './table';

export { EditorView };
export type { Edit };
// Re-exported for tests/callers that resolve it via the view module.
export { inCodeBlock };

function applyEdits(view: EditorView, edits: Edit | Edit[]): boolean {
  const list = Array.isArray(edits) ? edits : [edits];
  if (list.length === 0) return false;
  const changes = list.map((e) => ({ from: e.from, to: e.to, insert: e.insert }));
  // Single edits carry final cursor coords (producers compute them post-edit).
  // Multi-edits omit selection so CodeMirror maps it through the changes.
  if (list.length === 1) {
    const only = list[0]!;
    view.dispatch({ changes, selection: { anchor: only.selStart, head: only.selEnd } });
  } else {
    view.dispatch({ changes });
  }
  view.focus();
  return true;
}

function withRange(view: EditorView): { text: string; from: number; to: number } {
  const sel = view.state.selection.main;
  return { text: view.state.doc.toString(), from: sel.from, to: sel.to };
}

export const toggleBold = (view: EditorView): boolean => {
  const { text, from, to } = withRange(view);
  return applyEdits(view, toggleWrap(text, from, to, '**'));
};

export const toggleItalic = (view: EditorView): boolean => {
  const { text, from, to } = withRange(view);
  return applyEdits(view, toggleWrap(text, from, to, '*'));
};

export const toggleStrike = (view: EditorView): boolean => {
  const { text, from, to } = withRange(view);
  return applyEdits(view, toggleWrap(text, from, to, '~~'));
};

export const toggleCode = (view: EditorView): boolean => {
  const { text, from, to } = withRange(view);
  return applyEdits(view, toggleWrap(text, from, to, '`'));
};

export const toggleQuote = (view: EditorView): boolean => {
  const { text, from, to } = withRange(view);
  return applyEdits(view, toggleLinePrefix(text, from, to, '> '));
};

export const toggleBullet = (view: EditorView): boolean => {
  const { text, from, to } = withRange(view);
  return applyEdits(view, toggleLinePrefix(text, from, to, '- '));
};

export const toggleNumbered = (view: EditorView): boolean => {
  const { text, from, to } = withRange(view);
  return applyEdits(view, toggleOrdered(text, from, to));
};

export const toggleFence = (view: EditorView): boolean => {
  const { text, from, to } = withRange(view);
  return applyEdits(view, toggleFenceBlock(text, from, to));
};

export function toggleAlert(view: EditorView, kind: AlertKind): boolean {
  const { text, from, to } = withRange(view);
  return applyEdits(view, toggleAlertBlock(text, from, to, kind));
}

export const toggleCheckTask = (view: EditorView): boolean => {
  const { text, from, to } = withRange(view);
  return applyEdits(view, toggleTask(text, from, to));
};

export const insertMarkdownLink = (view: EditorView): boolean => {
  const { text, from, to } = withRange(view);
  return applyEdits(view, insertLink(text, from, to));
};

// ---------- slash commands ----------

/** `/query` range when the cursor ends an otherwise-empty line, else null. */
export function slashRange(state: EditorState): {
  lineStart: number;
  from: number;
  to: number;
  query: string;
} | null {
  const sel = state.selection.main;
  if (!sel.empty) return null;
  const pos = sel.head;
  const line = state.doc.lineAt(pos);
  // Trailing spaces after the query are ignored (completion stays open).
  const before = line.text.slice(0, pos - line.from).replace(/\s+$/, '');
  const m = /^(\s*)\/([\w-]*)$/.exec(before);
  if (!m) return null;
  const after = line.text.slice(pos - line.from);
  if (after !== '' && !/^\s*$/.test(after)) return null;
  return { lineStart: line.from, from: line.from + m[1]!.length, to: pos, query: m[2] ?? '' };
}

export function applySlashItem(view: EditorView, item: SlashItem): boolean {
  const range = slashRange(view.state);
  if (!range) return false;
  const edits = item.run(view.state.doc.toString(), range.lineStart, range.from, range.to);
  return applyEdits(view, edits);
}

function slashCompleter(ctx: CompletionContext): CompletionResult | null {
  const range = slashRange(ctx.state);
  if (!range || inCodeBlock(ctx.state, ctx.pos)) return null;
  const items = filterSlashItems(range.query);
  if (items.length === 0) return null;
    return {
      from: range.from,
      to: range.to,
      filter: false, // we filter on every keystroke ourselves
      options: items.map((item) => ({
        label: item.title,
        detail: item.description,
        type: `i-${item.id}`,
        apply: (view: EditorView) => {
          applySlashItem(view, item);
          return true;
        },
      })),
    };
}

export function slashCommands(): Extension {
  // Slash blocks + wikilinks + code suggestions share one completion menu.
  return autocompletion({ override: [slashCompleter, linkCompleter, codeCompleter] });
}

// ---------- markdown tables ----------

/** Dispatch a TableEdit (block replace + cursor). Offsets derived from the live doc. */
function dispatchTableEdit(view: EditorView, edit: TableEdit): boolean {
  const doc = view.state.doc;
  if (edit.startLine < 0 || edit.endLine >= doc.lines) return false;
  const from = doc.line(edit.startLine + 1).from;
  const to = doc.line(edit.endLine + 1).to;
  let pos = from;
  for (let i = 0; i < edit.cursorLine - edit.startLine; i++) {
    pos += edit.newLines[i]!.length + 1;
  }
  pos += Math.min(edit.cursorCh, edit.newLines[edit.cursorLine - edit.startLine]?.length ?? 0);
  view.dispatch({
    changes: { from, to, insert: edit.newLines.join('\n') },
    selection: { anchor: pos },
  });
  view.focus();
  return true;
}

/** Enter on a table row continues it (empty row exits). False elsewhere. */
export function tableEnter(view: EditorView): boolean {
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  const line = view.state.doc.lineAt(sel.head);
  if (!isTableRow(line.text)) return false;
  const lines = view.state.doc.toString().split('\n');
  const edit = continueTableRow(lines, line.number - 1);
  return edit ? dispatchTableEdit(view, edit) : false;
}

/** Tab/Shift-Tab cell navigation. False outside tables (falls through to indent). */
export function tableAdvance(view: EditorView, dir: 1 | -1): boolean {
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  const line = view.state.doc.lineAt(sel.head);
  if (!isTableRow(line.text)) return false;
  const lines = view.state.doc.toString().split('\n');
  const edit = advanceCell(lines, line.number - 1, sel.head - line.from, dir);
  return edit ? dispatchTableEdit(view, edit) : false;
}

/** mod-B/I, mod-shift-K link, mod-' quote, table-aware Tab/Enter. mod-E/P/K are app-level. */
export function markdownKeymap(): Extension {
  return keymap.of([
    { key: 'Enter', run: tableEnter },
    { key: 'Tab', run: (view) => tableAdvance(view, 1) || indentMore(view), shift: (view) => tableAdvance(view, -1) || indentLess(view) },
    { key: 'Mod-b', run: toggleBold },
    { key: 'Mod-i', run: toggleItalic },
    { key: 'Mod-Shift-k', run: insertMarkdownLink },
    { key: "Mod-'", run: toggleQuote },
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...historyKeymap,
  ]);
}

function buildTheme(dark: boolean, fontSize: number): Extension {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        fontSize: `${fontSize}px`,
        lineHeight: '1.65',
        backgroundColor: 'transparent',
      },
      '.cm-content': {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        caretColor: dark ? '#e4e4e7' : '#18181b',
        padding: '12px 0 40vh 0',
      },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        border: 'none',
        color: dark ? '#52525b' : '#a1a1aa',
      },
      '.cm-activeLine': {
        backgroundColor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
      },
      '.cm-activeLineGutter': { backgroundColor: 'transparent' },
      '&.cm-focused': { outline: 'none' },
      '.cm-selectionBackground, ::selection': {
        backgroundColor: dark ? 'rgba(56,189,248,0.25)' : 'rgba(14,165,233,0.2)',
      },
      // Fenced-code box (preview parity): one class per line, radii on ends.
      '.cm-codeblock': {
        backgroundColor: 'var(--code-bg)',
        paddingLeft: '12px',
        paddingRight: '12px',
      },
      '.cm-codeblock-first': {
        borderRadius: '8px 8px 0 0',
        paddingTop: '8px',
      },
      '.cm-codeblock-last': {
        borderRadius: '0 0 8px 8px',
        paddingBottom: '8px',
      },
      '.cm-codeblock-single': { borderRadius: '8px', paddingTop: '8px', paddingBottom: '8px' },
      // Slash menu + code suggestions: Telescope-style floating panel.
      '.cm-tooltip.cm-tooltip-autocomplete': {
        backgroundColor: 'var(--bg-raised)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
        padding: '4px',
        minWidth: '240px',
        maxWidth: '340px',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul': {
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        maxHeight: '260px',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 10px',
        borderRadius: '6px',
        fontSize: '13px',
        lineHeight: '1.4',
        color: 'var(--fg)',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected="true"]': {
        backgroundColor: 'var(--accent-soft)',
      },
      '.cm-tooltip .cm-completionIcon': {
        width: '20px',
        height: '20px',
        fontSize: '9px',
        fontWeight: '700',
        opacity: '0.55',
        textAlign: 'center',
        flexShrink: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      },
      '.cm-tooltip .cm-completionIcon-i-h1::before': { content: "'H'" },
      '.cm-tooltip .cm-completionIcon-i-h2::before': { content: "'H'" },
      '.cm-tooltip .cm-completionIcon-i-h3::before': { content: "'H'" },
      '.cm-tooltip .cm-completionIcon-i-bullet::before': { content: "'•'" },
      '.cm-tooltip .cm-completionIcon-i-numbered::before': { content: "'1'" },
      '.cm-tooltip .cm-completionIcon-i-task::before': { content: "'☐'" },
      '.cm-tooltip .cm-completionIcon-i-quote::before': { content: "'\"'" },
      '.cm-tooltip .cm-completionIcon-i-code::before': { content: "'</>'" },
      '.cm-tooltip .cm-completionIcon-i-divider::before': { content: "'—'" },
      '.cm-tooltip .cm-completionIcon-i-table::before': { content: "'▦'" },
      '.cm-tooltip .cm-completionIcon-i-lang::before': { content: "'</>'" },
      '.cm-tooltip .cm-completionIcon-i-word::before': { content: "'Aa'" },
      '.cm-tooltip .cm-completionLabel': {
        flex: '1 1 auto',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      '.cm-tooltip .cm-completionMatchedText': {
        color: 'var(--accent)',
        textDecoration: 'underline',
        textUnderlineOffset: '2px',
      },
      '.cm-tooltip .cm-completionDetail': {
        fontSize: '11px',
        opacity: '0.55',
        marginLeft: 'auto',
        paddingLeft: '12px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        fontStyle: 'normal',
      },
    },
    { dark },
  );
}

export const themeCompartment = new Compartment();
export const wrapCompartment = new Compartment();

/**
 * The one highlight style (CodeMirror merges by specificity, not extension
 * order, so a second style can't reliably override the defaults — we replace
 * them). Prose stays calm (inherits the app foreground); code follows the
 * theme `--code-*` variables (pastel on dark, saturated on light).
 */
const appHighlight = HighlightStyle.define([
  { tag: hlTags.heading1, fontSize: '1.6em', fontWeight: '700' },
  { tag: hlTags.heading2, fontSize: '1.4em', fontWeight: '700' },
  { tag: hlTags.heading3, fontSize: '1.2em', fontWeight: '700' },
  { tag: hlTags.heading4, fontSize: '1.08em', fontWeight: '700' },
  { tag: hlTags.heading5, fontSize: '1em', fontWeight: '700' },
  { tag: hlTags.heading6, fontSize: '0.95em', fontWeight: '700' },
  { tag: hlTags.quote, color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: hlTags.emphasis, fontStyle: 'italic' },
  { tag: hlTags.strong, fontWeight: '700' },
  { tag: hlTags.strikethrough, textDecoration: 'line-through' },
  { tag: hlTags.link, color: 'var(--accent)' },
  { tag: hlTags.url, color: 'var(--accent)' },
  { tag: hlTags.meta, color: 'var(--code-comment)' },
  { tag: hlTags.processingInstruction, color: 'var(--code-comment)' },
  { tag: hlTags.labelName, color: 'var(--code-comment)' },
  { tag: hlTags.attributeName, color: 'var(--code-comment)' },
  { tag: hlTags.namespace, color: 'var(--code-comment)' },
  { tag: hlTags.monospace, color: 'var(--code-fg)' },
  { tag: hlTags.keyword, color: 'var(--code-keyword)' },
  { tag: hlTags.string, color: 'var(--code-string)' },
  { tag: hlTags.regexp, color: 'var(--code-string)' },
  { tag: hlTags.comment, color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: hlTags.number, color: 'var(--code-number)' },
  { tag: hlTags.bool, color: 'var(--code-number)' },
  { tag: hlTags.function(hlTags.variableName), color: 'var(--code-title)' },
  { tag: hlTags.macroName, color: 'var(--code-title)' },
  { tag: hlTags.typeName, color: 'var(--code-builtin)' },
  { tag: hlTags.variableName, color: 'var(--code-fg)' },
]);

export interface EditorPrefs {
  dark: boolean;
  fontSize: number;
  wrap: boolean;
}

export function createEditorState(doc: string, dark: boolean, prefs?: Partial<EditorPrefs>): EditorState {
  const fontSize = prefs?.fontSize ?? 13.5;
  const wrap = prefs?.wrap ?? true;
  return EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      drawSelection(),
      dropCursor(),
      bracketMatching(),
      closeBrackets(),
      wrapCompartment.of(wrap ? EditorView.lineWrapping : []),
      markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
      syntaxHighlighting(appHighlight),
      codeBlockBox(),
      markdownKeymap(),
      slashCommands(),
      themeCompartment.of(buildTheme(dark, fontSize)),
    ],
  });
}

export interface MountOptions {
  parent: HTMLElement;
  doc: string;
  dark: boolean;
  fontSize?: number;
  wrap?: boolean;
  onDocChange: (doc: string) => void;
  /** Fired when the selection moves (incl. cursor motion without edits). */
  onSelection?: (from: number, to: number) => void;
}

/** Mount an EditorView; returns view + prefs reconfig helper. */
export function mountEditor(opts: MountOptions): {
  view: EditorView;
  setDark: (dark: boolean) => void;
  setPrefs: (prefs: EditorPrefs) => void;
} {
  const applyPrefs = (view: EditorView, prefs: EditorPrefs): void => {    view.dispatch({
      effects: [
        themeCompartment.reconfigure(buildTheme(prefs.dark, prefs.fontSize)),
        wrapCompartment.reconfigure(prefs.wrap ? EditorView.lineWrapping : []),
      ],
    });
  };
  let lastSel = { from: -1, to: -1 };
  const view = new EditorView({
    parent: opts.parent,
    state: createEditorState(opts.doc, opts.dark, { fontSize: opts.fontSize, wrap: opts.wrap }),
    dispatchTransactions: (trs, view) => {
      view.update(trs);
      const sel = view.state.selection.main;
      if (sel.from !== lastSel.from || sel.to !== lastSel.to) {
        lastSel = { from: sel.from, to: sel.to };
        opts.onSelection?.(sel.from, sel.to);
      }
      for (const tr of trs) {
        if (tr.docChanged) opts.onDocChange(view.state.doc.toString());
      }
    },
  });
  const basePrefs = (): EditorPrefs => ({
    dark: opts.dark,
    fontSize: opts.fontSize ?? 13.5,
    wrap: opts.wrap ?? true,
  });
  return {
    view,
    setDark: (dark: boolean) => applyPrefs(view, { ...basePrefs(), dark }),
    setPrefs: (prefs: EditorPrefs) => applyPrefs(view, prefs),
  };
}
