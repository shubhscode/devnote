// Wikilinks (2.2): `[[target]]` / `[[target|alias]]` parse, resolve by note
// title, and backlinks. No mdast node exists for `[[..]]` (remark parses it
// as plain text), so core uses a small deterministic scanner instead of
// remark: fenced blocks and inline code spans never contain links.

export interface Wikilink {
  /** Link target as written (trimmed). */
  target: string;
  /** Display alias (`[[target|alias]]`), or null. */
  alias: string | null;
  /** Offset span of the whole `[[..]]` (for editor completions/decorations). */
  from: number;
  to: number;
}

export interface LinkableNote {
  id: string;
  title: string;
  body: string;
  trashed: boolean;
  createdAt: string;
}

/** Split a line into code / non-code spans (backtick pairing). */
function nonCodeSpans(line: string): { from: number; to: number }[] {
  const spans: { from: number; to: number }[] = [];
  let at = 0;
  let cursor = 0;
  while (cursor < line.length) {
    const open = line.indexOf('`', cursor);
    if (open === -1) {
      spans.push({ from: at, to: line.length });
      break;
    }
    if (open > at) spans.push({ from: at, to: open });
    // Find the matching run of the same length (`` ` `` vs ```` ``` ````).
    let run = 1;
    while (line[open + run] === '`') run += 1;
    const close = line.indexOf('`'.repeat(run), open + run);
    cursor = close === -1 ? line.length : close + run;
    at = cursor;
  }
  return spans;
}

function inSpans(spans: { from: number; to: number }[], at: number): boolean {
  return spans.some((s) => at >= s.from && at < s.to);
}

export function parseWikilinks(body: string): Wikilink[] {
  const out: Wikilink[] = [];
  let offset = 0;
  let inFence = false;
  for (const line of body.split('\n')) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('```')) {
      inFence = !inFence;
    } else if (!inFence) {
      const spans = nonCodeSpans(line);
      let i = 0;
      while (i < line.length - 1) {
        const open = line.indexOf('[[', i);
        if (open === -1) break;
        if (!inSpans(spans, open)) {
          i = open + 2;
          continue;
        }
        const close = line.indexOf(']]', open + 2);
        if (close === -1 || !inSpans(spans, close)) {
          i = open + 2;
          continue;
        }
        const inner = line.slice(open + 2, close);
        // No nesting: a second `[[` before the close voids the match.
        if (inner.includes('[[')) {
          i = open + 2;
          continue;
        }
        const pipe = inner.indexOf('|');
        const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
        const alias = pipe === -1 ? null : inner.slice(pipe + 1).trim();
        if (target !== '') {
          out.push({
            target,
            alias: alias === '' ? null : alias,
            from: offset + open,
            to: offset + close + 2,
          });
        }
        i = close + 2;
      }
    }
    offset += line.length + 1;
  }
  return out;
}

function normTitle(t: string): string {
  return t.trim().toLowerCase();
}

/**
 * Resolve a target to a note by exact title (case-insensitive), oldest
 * first. Trashed notes never resolve (links to them read as broken).
 */
export function resolveWikilink<T extends LinkableNote>(target: string, notes: T[]): T | null {
  const key = normTitle(target);
  if (key === '') return null;
  const cands = notes
    .filter((n) => !n.trashed && normTitle(n.title) === key)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return cands[0] ?? null;
}

export interface Backlink {
  noteId: string;
  title: string;
  /** How many wikilinks in that note resolve here. */
  count: number;
}

/** Notes linking to `noteId` (non-trashed, self excluded). */
export function backlinksFor<T extends LinkableNote>(noteId: string, notes: T[]): Backlink[] {
  const out: Backlink[] = [];
  for (const n of notes) {
    if (n.id === noteId || n.trashed) continue;
    let count = 0;
    for (const link of parseWikilinks(n.body)) {
      if (resolveWikilink(link.target, notes)?.id === noteId) count += 1;
    }
    if (count > 0) out.push({ noteId: n.id, title: n.title, count });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}
