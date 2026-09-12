// Code suggestions for the Markdown editor: fence-language completion +
// document-word completion. Typing inside code completes automatically;
// Ctrl+Space completes words anywhere. Slash blocks stay in slash.ts.
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import type { EditorState } from '@codemirror/state';

export interface FenceLanguage {
  name: string;
  aliases: string[];
}

/** Language names + aliases from @codemirror/language-data, deduped + sorted. */
export function fenceLanguages(): FenceLanguage[] {
  const seen = new Map<string, string[]>();
  for (const l of languages) {
    const name = l.name.toLowerCase();
    if (!seen.has(name)) seen.set(name, l.alias.map((a) => a.toLowerCase()));
  }
  return [...seen.entries()]
    .map(([name, aliases]) => ({ name, aliases }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** True inside fenced code (slash menu stays out of code; words complete in it). */
export function inCodeBlock(state: EditorState, pos: number): boolean {
  let node = syntaxTree(state).resolveInner(pos, -1).node;
  while (node) {
    if (node.name === 'FencedCode') return true;
    const parent = node.parent;
    if (!parent) break;
    node = parent;
  }
  return false;
}

/** ` ```query` info-string prefix on this line, or null. */
export function fenceInfoPrefix(state: EditorState, pos: number): { from: number; query: string } | null {
  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  const m = /^```([^\s`]*)$/.exec(before);
  if (!m) return null;
  const query = m[1] ?? '';
  return { from: pos - query.length, query };
}

/** Distinct 3+ char words across the doc (for word completion). */
export function collectWords(doc: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of doc.matchAll(/[\p{L}_][\p{L}\p{N}_-]{2,}/gu)) {
    const w = m[0];
    if (!seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  }
  return out;
}

/** Language options for a fence info string (null when nothing matches). */
export function languageOptions(query: string): { label: string; detail: string }[] {
  const q = query.toLowerCase();
  const out: { label: string; detail: string }[] = [];
  for (const lang of fenceLanguages()) {
    if (lang.name.startsWith(q)) out.push({ label: lang.name, detail: 'language' });
    for (const a of lang.aliases) {
      if (a.startsWith(q) && a !== lang.name) out.push({ label: a, detail: lang.name });
    }
    if (out.length >= 30) break;
  }
  return out;
}

export function codeCompleter(ctx: CompletionContext): CompletionResult | null {
  const info = fenceInfoPrefix(ctx.state, ctx.pos);
  if (info) {
    const options = languageOptions(info.query);
    if (options.length === 0) return null;
    return {
      from: info.from,
      to: ctx.pos,
      filter: false, // prefiltered per keystroke above
      options: options.map((o) => ({ ...o, type: 'i-lang' })),
    };
  }
  const inCode = inCodeBlock(ctx.state, ctx.pos);
  if (!inCode && !ctx.explicit) return null;
  const word = ctx.matchBefore(/[\p{L}\p{N}_-]+$/u);
  if (!word || (word.text === '' && !ctx.explicit)) return null;
  const prefix = word.text.toLowerCase();
  const options = collectWords(ctx.state.doc.toString())
    .filter((w) => w.toLowerCase().startsWith(prefix) && w !== word.text)
    .slice(0, 20)
    .map((label) => ({ label, type: 'i-word' as const }));
  if (options.length === 0) return null;
  return { from: word.from, to: word.to, options };
}
