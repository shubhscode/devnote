// Perf benchmarks: search, snippet/row work, sort, core pipeline.
// Run: pnpm bench
import { bench, describe } from 'vitest';
import { bestSnippet, parseSearch, titleRanges, searchNotes, nowIso } from './index';
import type { Note, Notebook, NoteStatus } from './index';
import { sortNotes } from './notes';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  'hook', 'effect', 'state', 'render', 'component', 'typescript', 'database',
  'replication', 'notebook', 'search', 'index', 'markdown', 'preview', 'editor',
  'sync', 'cache', 'query', 'filter', 'sort', 'branch', 'merge', 'deploy',
  'performance', 'optimization', 'refactor', 'testing', 'debugging', 'interface',
  'module', 'pattern', 'architecture', 'concurrency', 'serialization', 'protocol',
];
const TAGS = ['work', 'ts', 'rust', 'plan', 'idea', 'bug', 'docs', 'perf', 'backend', 'frontend', 'devops', 'ux'];
const STATUSES: NoteStatus[] = ['none', 'active', 'onHold', 'completed', 'dropped'];

function seed5k(): { notes: Note[]; notebooks: Notebook[] } {
  const rand = mulberry32(42);
  const now = nowIso();
  const notebooks: Notebook[] = Array.from({ length: 20 }, (_, i) => ({
    id: `nb-${i}`,
    name: i % 4 === 0 ? `project-${i}` : `notebook-${i}`,
    parentId: i >= 10 ? `nb-${i - 10}` : null,
    sortOrder: i,
    createdAt: now,
    updatedAt: now,
  }));
  const pick = (arr: string[]): string => arr[Math.floor(rand() * arr.length)]!;
  const notes: Note[] = Array.from({ length: 5000 }, (_, i) => {
    const title = `${pick(WORDS)} ${pick(WORDS)} ${i}`;
    const body = Array.from({ length: 50 }, () => pick(WORDS)).join(' ');
    return {
      id: `n-${i}`,
      title,
      body,
      notebookId: `nb-${i % 20}`,
      tags: [pick(TAGS), pick(TAGS)],
      status: STATUSES[i % STATUSES.length]!,
      pinned: i % 97 === 0,
      trashed: i % 200 === 0,
      createdAt: now,
      updatedAt: now,
    };
  });
  return { notes, notebooks };
}

const { notes, notebooks } = seed5k();
const activeNotes = notes.filter((n) => !n.trashed);

// ── searchNotes (core) ────────────────────────────────────────────────
describe('searchNotes 5k notes', () => {
  bench('bare term', () => {
    searchNotes(activeNotes, notebooks, 'effect');
  });

  bench('qualifiers + phrase', () => {
    searchNotes(activeNotes, notebooks, 'book:project tag:ts status:active "state render"');
  });

  bench('exclusion only', () => {
    searchNotes(activeNotes, notebooks, '-tag:bug -tag:work');
  });
});

// ── snippet / title work (per-row) ────────────────────────────────────
describe('per-row work (200 rows)', () => {
  const terms = parseSearch('state hook effect');
  const slice = activeNotes.slice(0, 200);

  bench('bestSnippet x200', () => {
    for (const n of slice) bestSnippet(n.body, terms);
  });

  bench('titleRanges x200', () => {
    for (const n of slice) titleRanges(n.title, terms);
  });
});

// ── sortNotes ─────────────────────────────────────────────────────────
describe('sortNotes 5k', () => {
  bench('sort by pinned + updatedAt', () => {
    sortNotes(activeNotes);
  });
});
