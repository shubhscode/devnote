// Table-of-contents extraction for Telescope `#` (headings + task items).
// Uses the CodeMirror/lezer syntax tree — never regex on Markdown (AGENTS.md §5).
// DOM-free; fully unit-tested. TODO: Setext headings (ATX covers the editor).
import { markdownLanguage } from '@codemirror/lang-markdown';

export interface TocEntry {
  kind: 'heading' | 'task';
  level?: number; // heading level 1-6
  text: string;
  checked?: boolean; // tasks only
  pos: number; // doc offset (jump maps to line start)
}

export function extractToc(doc: string): TocEntry[] {
  const out: TocEntry[] = [];
  const tree = markdownLanguage.parser.parse(doc);
  const cursor = tree.cursor();
  do {
    const name = cursor.name;
    if (name.startsWith('ATXHeading')) {
      const level = Number(name.slice('ATXHeading'.length));
      if (level >= 1 && level <= 6) {
        const raw = doc.slice(cursor.from, cursor.to);
        const text = raw.replace(/^#{1,6}\s*/, '').trim();
        if (text !== '') out.push({ kind: 'heading', level, text, pos: cursor.from });
      }
    } else if (name === 'Task') {
      const raw = doc.slice(cursor.from, cursor.to);
      const m = /^\[([ xX])\]\s*/.exec(raw.trim());
      if (m) {
        out.push({
          kind: 'task',
          checked: m[1]!.toLowerCase() === 'x',
          text: raw.trim().replace(/^\[[ xX]\]\s*/, ''),
          pos: cursor.from,
        });
      }
    }
  } while (cursor.next());
  return out;
}
