// @devnote/core — pure TS domain logic. No react, no fs, no window.
// See AGENTS.md §5-6 and PLAN.md §2.
export * from './types';
export * from './notebooks';
export * from './notes';
export * from './search';
export * from './templates';
export * from './revisions';
export * from './fuzzy';
export * from './mirror';
export * from './themes';
export * from './storage';
export * from './tags';

/** Minimal search-query stub (full FTS grammar in Phase 1c per PLAN.md §3). */
export interface SearchQuery {
  text: string;
  book?: string;
  tags: string[];
  status?: string;
}

export function parseSearchQuery(input: string): SearchQuery {
  const tags: string[] = [];
  let book: string | undefined;
  let status: string | undefined;
  const textParts: string[] = [];
  // Tokenize respecting double quotes
  const tokens = input.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  for (const tok of tokens) {
    const t = tok.replace(/^"|"$/g, '');
    if (t.startsWith('tag:')) tags.push(t.slice(4));
    else if (t.startsWith('book:')) book = t.slice(5);
    else if (t.startsWith('status:')) status = t.slice(7);
    else textParts.push(tok);
  }
  return { text: textParts.join(' ').trim(), book, tags, status };
}
