// Slash commands for the Markdown editor (editorcn-inspired UX on CodeMirror).
// Block insertions triggered by `/` on an otherwise-empty line; suppressed
// inside fenced code. Items compute pure Edits (tested) — view.ts applies them.
import type { Edit } from './text';

export interface SlashItem {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  run: (text: string, lineStart: number, slashFrom: number, slashTo: number) => Edit[];
}

/** Replace the whole line ([lineStart, slashTo]) with `insert`, placing the cursor at offset. */
function replaceLine(lineStart: number, slashTo: number, insert: string, cursorOffset: number): Edit[] {
  return [{
    from: lineStart,
    to: slashTo,
    insert,
    selStart: lineStart + cursorOffset,
    selEnd: lineStart + cursorOffset,
  }];
}

function prefixItem(
  id: string,
  title: string,
  description: string,
  keywords: string[],
  prefix: string,
): SlashItem {
  return {
    id,
    title,
    description,
    keywords,
    run: (_text, lineStart, _slashFrom, slashTo) =>
      replaceLine(lineStart, slashTo, prefix, prefix.length),
  };
}

export const SLASH_ITEMS: SlashItem[] = [
  prefixItem('h1', 'Heading 1', 'Large section heading', ['title', 'header', 'hash'], '# '),
  prefixItem('h2', 'Heading 2', 'Medium section heading', ['title', 'header'], '## '),
  prefixItem('h3', 'Heading 3', 'Small section heading', ['title', 'header'], '### '),
  prefixItem('bullet', 'Bullet list', 'Unordered list item', ['ul', 'list', 'dash'], '- '),
  prefixItem('numbered', 'Numbered list', 'Ordered list item', ['ol', 'list'], '1. '),
  prefixItem('task', 'Task list', 'Checkbox list item', ['todo', 'checkbox', 'check'], '- [ ] '),
  prefixItem('quote', 'Quote', 'Blockquote', ['blockquote', 'cite'], '> '),
  {
    id: 'code',
    title: 'Code block',
    description: 'Fenced code block',
    keywords: ['fence', 'snippet', 'pre'],
    run: (_text, lineStart, _slashFrom, slashTo) =>
      replaceLine(lineStart, slashTo, '```\n\n```', 4),
  },
  {
    id: 'divider',
    title: 'Divider',
    description: 'Horizontal rule',
    keywords: ['hr', 'rule', '---'],
    run: (_text, lineStart, _slashFrom, slashTo) =>
      replaceLine(lineStart, slashTo, '---', 3),
  },
  {
    id: 'table',
    title: 'Table',
    description: '2×2 GFM table',
    keywords: ['grid', 'columns', 'rows'],
    run: (_text, lineStart, _slashFrom, slashTo) =>
      replaceLine(lineStart, slashTo, '|  |  |\n|---|---|\n|  |  |', 2),
  },
];

/** Substring filter over title, id, and keywords. Empty query returns all. */
export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (q === '') return SLASH_ITEMS;
  return SLASH_ITEMS.filter((item) =>
    [item.title, item.id, ...item.keywords].some((s) => s.toLowerCase().includes(q)),
  );
}
