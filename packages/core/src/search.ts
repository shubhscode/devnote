// Full search grammar (Inkdrop parity, PLAN.md §5).
//   book:NAME tag:TAG status:STATUS title:TEXT body:TEXT "quoted phrase" -exclusion
// Terms combine with AND; exclusions subtract. Exclusions-only matches nothing
// (same documented limitation as Inkdrop).
//
// Matching is case-insensitive substring (SQLite FTS5 in the Tauri backend
// will rank the same way; no partial-match stemming — documented like Inkdrop).
import { notebookPath } from './notebooks';
import type { Note, Notebook } from './types';

export type SearchField = 'book' | 'tag' | 'status' | 'title' | 'body';

export interface SearchTerm {
  field: SearchField | null; // null = bare text (title + body + tags)
  value: string;
  exclude: boolean;
}

const FIELDS: SearchField[] = ['book', 'tag', 'status', 'title', 'body'];

/**
 * Tokenize respecting quotes and `-` exclusions:
 *   -book:Backend "closure functions" -tag:js -"ignore me" title:"Sprint 10"
 */
export function parseSearch(input: string): SearchTerm[] {
  const terms: SearchTerm[] = [];
  const re = /(-)?(?:(book|tag|status|title|body):)?("[^"]*"|[^\s"]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const exclude = m[1] === '-';
    const field = (m[2] as SearchField | undefined) ?? null;
    let value = m[3] ?? '';
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }
    if (value === '') continue;
    if (field !== null && !FIELDS.includes(field)) continue;
    terms.push({ field, value, exclude });
  }
  return terms;
}

/** True when the query has terms but none positive (matches nothing). */
export function isExclusionsOnly(terms: SearchTerm[]): boolean {
  return terms.length > 0 && terms.every((t) => t.exclude);
}

function ciIncludes(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function ciEquals(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Lowercase index: built once per searchNotes call, reused across all match/score ops. */
export interface LowerIndex {
  titles: Map<string, string>;
  bodies: Map<string, string>;
  tags: Map<string, string[]>;
}

export function buildLowerIndex(notes: Note[]): LowerIndex {
  const titles = new Map<string, string>();
  const bodies = new Map<string, string>();
  const tags = new Map<string, string[]>();
  for (const n of notes) {
    titles.set(n.id, n.title.toLowerCase());
    bodies.set(n.id, n.body.toLowerCase());
    tags.set(n.id, n.tags.map((t) => t.toLowerCase()));
  }
  return { titles, bodies, tags };
}

function matchLower(lowerId: string, needle: string, field: SearchField | null, note: Note, lower: LowerIndex): boolean {
  const v = needle;
  switch (field) {
    case 'book':
      return notebookPath([], note.notebookId).toLowerCase().includes(v);
    case 'tag':
      return lower.tags.get(lowerId)?.some((t) => t === v) ?? false;
    case 'status':
      return note.status.toLowerCase() === v;
    case 'title':
      return lower.titles.get(lowerId)?.includes(v) ?? false;
    case 'body':
      return lower.bodies.get(lowerId)?.includes(v) ?? false;
    case null:
      return (
        (lower.titles.get(lowerId)?.includes(v) ?? false) ||
        (lower.bodies.get(lowerId)?.includes(v) ?? false) ||
        (lower.tags.get(lowerId)?.some((t) => t.includes(v)) ?? false)
      );
  }
}

/** Does a single (non-negated) term hit this note? */
export function matchTerm(note: Note, notebooks: Notebook[], term: SearchTerm): boolean {
  const v = term.value;
  switch (term.field) {
    case 'book':
      return ciIncludes(notebookPath(notebooks, note.notebookId), v);
    case 'tag':
      return note.tags.some((t) => ciEquals(t, v));
    case 'status':
      return ciEquals(note.status, v);
    case 'title':
      return ciIncludes(note.title, v);
    case 'body':
      return ciIncludes(note.body, v);
    case null:
      return (
        ciIncludes(note.title, v) ||
        ciIncludes(note.body, v) ||
        note.tags.some((t) => ciIncludes(t, v))
      );
  }
}

/** TF-ish rank: title hits weigh most, then tags, then body.
 * Qualifier hits score flat. Deterministic for stable sorts. */
export function scoreNote(note: Note, notebooks: Notebook[], includes: SearchTerm[], lower?: LowerIndex): number {
  let score = 0;
  const lid = lower ? note.id : undefined;
  for (const term of includes) {
    if (term.field !== null) {
      score += 2;
      continue;
    }
    const v = term.value.toLowerCase();
    if (lower) {
      if (lower.titles.get(lid!)?.includes(v)) score += 3;
      if (lower.tags.get(lid!)?.some((t) => t.includes(v))) score += 2;
      if (lower.bodies.get(lid!)?.includes(v)) score += 1;
    } else {
      if (ciIncludes(note.title, term.value)) score += 3;
      if (note.tags.some((t) => ciIncludes(t, term.value))) score += 2;
      if (ciIncludes(note.body, term.value)) score += 1;
    }
  }
  return score;
}

export interface ScoredNote {
  note: Note;
  score: number;
}

/**
 * Filter + rank notes. Returns [] for empty term lists AND exclusions-only
 * queries (caller shows a hint for the latter — Inkdrop parity).
 * Sort: pinned first, score desc, updatedAt desc.
 */
export function searchNotes(notes: Note[], notebooks: Notebook[], query: string): ScoredNote[] {
  const terms = parseSearch(query);
  if (terms.length === 0) {
    return notes.map((note) => ({ note, score: 0 }));
  }
  if (isExclusionsOnly(terms)) return [];
  const includes = terms.filter((t) => !t.exclude);
  const excludes = terms.filter((t) => t.exclude);
  // Build lowercase index once — avoids repeated toLowerCase per term per note.
  const lower = buildLowerIndex(notes);
  const out: ScoredNote[] = [];
  for (const note of notes) {
    const lid = note.id;
    const matchInc = includes.every((t) =>
      t.field !== null ? matchLower(lid, t.value.toLowerCase(), t.field, note, lower) : matchLower(lid, t.value.toLowerCase(), null, note, lower)
    );
    if (!matchInc) continue;
    const matchExc = excludes.some((t) =>
      t.field !== null ? matchLower(lid, t.value.toLowerCase(), t.field, note, lower) : matchLower(lid, t.value.toLowerCase(), null, note, lower)
    );
    if (matchExc) continue;
    out.push({ note, score: scoreNote(note, notebooks, includes, lower) });
  }
  out.sort((a, b) => {
    if (a.note.pinned !== b.note.pinned) return a.note.pinned ? -1 : 1;
    if (a.score !== b.score) return b.score - a.score;
    return b.note.updatedAt.localeCompare(a.note.updatedAt);
  });
  return out;
}

// ---------- match highlighting ----------

export interface Range {
  start: number;
  end: number;
}

/** All case-insensitive occurrences of needle in text. */
export function findRanges(text: string, needle: string): Range[] {
  if (needle === '') return [];
  const lower = text.toLowerCase();
  const want = needle.toLowerCase();
  const ranges: Range[] = [];
  let at = 0;
  while (true) {
    const i = lower.indexOf(want, at);
    if (i === -1) break;
    ranges.push({ start: i, end: i + want.length });
    at = i + Math.max(1, want.length);
  }
  return ranges;
}

/** Merge overlapping/adjacent ranges, sorted. */
export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/** Ranges to <mark> in a title for the given positive terms. */
export function titleRanges(title: string, terms: SearchTerm[]): Range[] {
  const ranges: Range[] = [];
  for (const t of terms) {
    if (t.exclude) continue;
    if (t.field === null || t.field === 'title') {
      ranges.push(...findRanges(title, t.value));
    }
  }
  return mergeRanges(ranges);
}

export interface Snippet {
  text: string;
  ranges: Range[];
  matched: boolean;
}

const SNIPPET_LEN = 120;

/**
 * Bestsnipp line: first body line containing a bare/body term; else first
 * non-empty line. Ranges are relative to the returned (possibly trimmed) text.
 * Pass `lowerBody` to skip repeated toLowerCase (precomputed via buildLowerIndex).
 */
export function bestSnippet(body: string, terms: SearchTerm[], lowerBody?: string): Snippet {
  const live = terms.filter((t) => !t.exclude && (t.field === null || t.field === 'body'));
  const lines = body.split('\n');
  const lb = lowerBody ?? body.toLowerCase();
  const lbLines = lb.split('\n');
  const hit = live.length === 0
    ? undefined
    : lines.find((_, i) => live.some((t) => lbLines[i]?.includes(t.value.toLowerCase())));
  const raw = hit ?? lines.find((l) => l.trim() !== '') ?? '';
  const text = raw.length > SNIPPET_LEN ? `${raw.slice(0, SNIPPET_LEN)}…` : raw;
  if (hit === undefined) return { text, ranges: [], matched: false };
  const ranges = mergeRanges(live.flatMap((t) => findRanges(text, t.value)));
  return { text, ranges, matched: true };
}
