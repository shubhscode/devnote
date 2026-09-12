// Perf gate: 5k-note search (PLAN.md §6 — p95 <50ms).
// Run: pnpm bench. Deterministic seed (mulberry32) for stable numbers.
import { bench, describe } from 'vitest';
import { nowIso, searchNotes } from './index';
import type { Note, Notebook, NoteStatus } from './index';

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
];
const TAGS = ['work', 'ts', 'rust', 'plan', 'idea', 'bug', 'docs', 'perf'];
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
    const body = Array.from({ length: 30 }, () => pick(WORDS)).join(' ');
    return {
      id: `n-${i}`,
      title,
      body,
      notebookId: `nb-${i % 20}`,
      tags: [pick(TAGS), pick(TAGS)],
      status: STATUSES[i % STATUSES.length]!,
      pinned: i % 97 === 0,
      trashed: false,
      createdAt: now,
      updatedAt: now,
    };
  });
  return { notes, notebooks };
}

const { notes, notebooks } = seed5k();

describe('search 5k notes', () => {
  bench('bare term', () => {
    searchNotes(notes, notebooks, 'effect');
  });
  bench('combined qualifiers', () => {
    searchNotes(notes, notebooks, 'book:project tag:ts status:active hook');
  });
  bench('phrase + exclusion', () => {
    searchNotes(notes, notebooks, '"state render" -tag:bug');
  });
});
