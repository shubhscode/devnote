// Markdown file mirror (Phase 3a): notes <-> `~/devnote` .md files with YAML
// frontmatter. Pure functions — Tauri fs + git CLI live in apps/desktop and
// packages/sync. SQLite (later) is an index; files are the truth.
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { NOTE_STATUSES, generateId, nowIso } from './types';
import type { Note, Notebook, NoteStatus } from './types';
import { notebookPath } from './notebooks';

export const MIRROR_ROOT = 'devnote';

/** Filesystem-safe single path segment (keeps unicode, drops separators). */
export function sanitizeSegment(name: string): string {
  const cleaned = name
    .replace(/[\/\\]/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 100);
  return cleaned === '' ? 'Untitled' : cleaned;
}

/** URL-ish slug for filenames. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\u00a0-\u024f\u1e00-\u1eff-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return slug === '' ? 'untitled' : slug;
}

/** Stable filename: slug + id prefix (survives title renames). */
export function noteFilename(note: Note): string {
  return `${slugify(note.title)}-${note.id.slice(0, 8)}.md`;
}

/** `Notebooks/Sub/name-id8.md` with sanitized segments. Unknown notebook → Unsorted. */
export function noteRelativePath(note: Note, notebooks: Notebook[]): string {
  const nb = notebooks.find((n) => n.id === note.notebookId);
  const segments = nb
    ? notebookPath(notebooks, nb.id).split(' / ').map(sanitizeSegment)
    : ['Unsorted'];
  return [...segments, noteFilename(note)].join('/');
}

export interface NoteFrontmatter {
  id: string;
  title: string;
  notebook: string;
  tags: string[];
  status: NoteStatus;
  pinned: boolean;
  trashed: boolean;
  createdAt: string;
  updatedAt: string;
}

function validDate(v: unknown, fallback: string): string {
  if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) return v;
  return fallback;
}

function toNoteStatus(v: unknown): NoteStatus {
  return typeof v === 'string' && (NOTE_STATUSES as string[]).includes(v)
    ? (v as NoteStatus)
    : 'none';
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((t): t is string => typeof t === 'string');
}

/** Serialize a note to frontmatter Markdown. */
export function noteToMarkdown(note: Note, notebooks: Notebook[]): string {
  const nb = notebooks.find((n) => n.id === note.notebookId);
  const frontmatter: NoteFrontmatter = {
    id: note.id,
    title: note.title,
    notebook: nb ? notebookPath(notebooks, nb.id) : 'Unsorted',
    tags: note.tags,
    status: note.status,
    pinned: note.pinned,
    trashed: note.trashed,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
  const body = note.body.startsWith('\n') ? note.body : `\n${note.body}`;
  return `---\n${stringifyYaml(frontmatter)}---${body.replace(/\n*$/, '\n')}`;
}

function splitFrontmatter(markdown: string): { data: Record<string, unknown>; content: string } {
  const lines = markdown.split('\n');
  if (lines[0]?.trim() !== '---') return { data: {}, content: markdown };
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (close === -1) return { data: {}, content: markdown };
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = parseYaml(lines.slice(1, close).join('\n'));
    if (typeof parsed === 'object' && parsed !== null) data = parsed as Record<string, unknown>;
  } catch {
    data = {};
  }
  return { data, content: lines.slice(close + 1).join('\n') };
}

/** Frontmatter `id` only (cheap orphan detection on export). */
export function extractFileId(content: string): string | null {
  const { data } = splitFrontmatter(content);
  return typeof data.id === 'string' && data.id !== '' ? data.id : null;
}

/** Split raw Markdown into frontmatter data + body (exported for sync/merge). */
export function readFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const { data, content: body } = splitFrontmatter(content);
  return { data, body };
}

/** Reassemble frontmatter data + body into Markdown (inverse of readFrontmatter). */
export function writeFrontmatter(data: Record<string, unknown>, body: string): string {
  const normalized = body.startsWith('\n') ? body : `\n${body}`;
  return `---\n${stringifyYaml(data)}---${normalized.replace(/\n*$/, '\n')}`;
}

/** Frontmatter `updatedAt` when valid ISO, else null (conflict ordering). */
export function fileUpdatedAt(content: string): string | null {
  const { data } = splitFrontmatter(content);
  return typeof data.updatedAt === 'string' && !Number.isNaN(Date.parse(data.updatedAt))
    ? data.updatedAt
    : null;
}

/** Guess a title for id-less files: H1, else prettified filename stem. */
export function filenameToTitle(path: string): string {
  const stem = path.split('/').pop()!.replace(/\.md$/, '').replace(/-[0-9a-f]{8}$/i, '');
  const words = stem.replace(/[-_]+/g, ' ').trim();
  return words === '' ? 'Untitled' : words;
}

export interface ParsedMirrorNote {
  note: Partial<Note> & { id: string };
  hasFrontmatter: boolean;
}

/** Parse file content toward a Note (id generated when absent). */
export function parseMirrorNote(content: string, path: string, now: string = nowIso()): ParsedMirrorNote {
  const { data, content: body } = splitFrontmatter(content);
  const hasFrontmatter = Object.keys(data).length > 0;
  const trimmedBody = body.replace(/^\n+/, '');
  let title = typeof data.title === 'string' ? data.title : '';
  if (title === '') {
    const h1 = trimmedBody.split('\n').find((l) => /^#\s+/.test(l));
    title = h1 !== undefined ? h1.replace(/^#\s+/, '').trim() : filenameToTitle(path);
  }
  return {
    hasFrontmatter,
    note: {
      id: typeof data.id === 'string' && data.id !== '' ? data.id : generateId(),
      title,
      body: trimmedBody.replace(/\n*$/, '\n').replace(/^\n+/, ''),
      tags: toStringArray(data.tags),
      status: toNoteStatus(data.status),
      pinned: data.pinned === true,
      trashed: data.trashed === true,
      createdAt: validDate(data.createdAt, now),
      updatedAt: validDate(data.updatedAt, now),
      notebookId: '', // resolved by planImport via `notebook` path
    },
  };
}

// ---------- reconcile ----------

export interface MirrorFile {
  path: string;
  content: string;
}

/** Resolve a `A / B` notebook path, creating missing notebooks. Pure (array in/out). */
export function resolveNotebookPath(
  notebooks: Notebook[],
  path: string,
  now: string = nowIso(),
): { notebooks: Notebook[]; id: string; created: Notebook[] } {
  const segments = path.split('/').map((s) => s.trim()).filter((s) => s !== '');
  if (segments.length === 0) segments.push('Unsorted');
  let next = [...notebooks];
  const created: Notebook[] = [];
  let parentId: string | null = null;
  for (const seg of segments) {
    const found = next.find(
      (n) => n.parentId === parentId && n.name.toLowerCase() === seg.toLowerCase(),
    );
    if (found) {
      parentId = found.id;
      continue;
    }
    const siblings = next.filter((n) => n.parentId === parentId);
    const nb: Notebook = {
      id: generateId(),
      name: seg,
      parentId,
      sortOrder: siblings.reduce((m, n) => Math.max(m, n.sortOrder), -1) + 1,
      createdAt: now,
      updatedAt: now,
    };
    next.push(nb);
    created.push(nb);
    parentId = nb.id;
  }
  return { notebooks: next, id: parentId!, created };
}

export interface ImportError {
  path: string;
  message: string;
}

export interface ImportResult {
  notes: Note[];
  notebooks: Notebook[];
  created: number;
  updated: number;
  /** Id-less files that need their new id written back for stability. */
  adoptions: { path: string; content: string }[];
  errors: ImportError[];
}

function injectId(content: string, fields: { id: string; createdAt: string; updatedAt: string }): string {
  const lines = content.split('\n');
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (close !== -1) {
      let data: Record<string, unknown> = {};
      try {
        const parsed: unknown = parseYaml(lines.slice(1, close).join('\n'));
        if (typeof parsed === 'object' && parsed !== null) data = { ...(parsed as Record<string, unknown>) };
      } catch { /* keep raw body below */ }
      data.id = fields.id;
      if (data.createdAt === undefined) data.createdAt = fields.createdAt;
      if (data.updatedAt === undefined) data.updatedAt = fields.updatedAt;
      return `---\n${stringifyYaml(data)}---\n${lines.slice(close + 1).join('\n')}`;
    }
  }
  return `---\n${stringifyYaml(fields)}---\n${content}`;
}

/**
 * Reconcile files into notes. Newer `updatedAt` wins per note; db-newer files
 * are skipped (the next export overwrites them). Never deletes.
 */
export function planImport(
  notes: Note[],
  notebooks: Notebook[],
  files: MirrorFile[],
  now: string = nowIso(),
): ImportResult {
  let nextNotes = [...notes];
  let nextBooks = [...notebooks];
  let created = 0;
  let updated = 0;
  const adoptions: { path: string; content: string }[] = [];
  const errors: ImportError[] = [];

  for (const file of files) {
    if (!file.path.endsWith('.md')) continue;
    let parsed: ParsedMirrorNote;
    try {
      parsed = parseMirrorNote(file.content, file.path, now);
    } catch (e) {
      errors.push({ path: file.path, message: e instanceof Error ? e.message : 'parse error' });
      continue;
    }
    const hadId = extractFileId(file.content) !== null;
    const existing = nextNotes.find((n) => n.id === parsed.note.id);
    if (!existing) {
      const rawPath =
        (() => {
          try {
            const { data } = splitFrontmatter(file.content);
            return typeof data.notebook === 'string' && data.notebook.trim() !== ''
              ? data.notebook
              : file.path.split('/').slice(0, -1).join(' / ');
          } catch {
            return '';
          }
        })();
      const resolved = resolveNotebookPath(nextBooks, rawPath || 'Unsorted', now);
      nextBooks = resolved.notebooks;
      nextNotes.push({ ...parsed.note, notebookId: resolved.id } as Note);
      created += 1;
      if (!hadId) {
        adoptions.push({
          path: file.path,
          content: injectId(file.content, {
            id: parsed.note.id,
            createdAt: parsed.note.createdAt!,
            updatedAt: parsed.note.updatedAt!,
          }),
        });
      }
      continue;
    }
    if (parsed.note.updatedAt! > existing.updatedAt) {
      const rawPath = (() => {
        const { data } = splitFrontmatter(file.content);
        return typeof data.notebook === 'string' ? data.notebook : '';
      })();
      let notebookId = existing.notebookId;
      if (rawPath.trim() !== '') {
        const resolved = resolveNotebookPath(nextBooks, rawPath, now);
        nextBooks = resolved.notebooks;
        notebookId = resolved.id;
      }
      nextNotes = nextNotes.map((n) =>
        n.id === existing.id
          ? { ...n, ...parsed.note, notebookId, id: n.id, createdAt: n.createdAt }
          : n,
      );
      updated += 1;
    }
  }
  return { notes: nextNotes, notebooks: nextBooks, created, updated, adoptions, errors };
}

export interface ExportPlan {
  writes: { path: string; content: string }[];
  deletes: string[];
  skipped: number;
}

/** Writes for changed/moved notes + deletes for orphaned ids (id-bearing files only). */
export function planExport(notes: Note[], notebooks: Notebook[], files: MirrorFile[]): ExportPlan {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const writes: { path: string; content: string }[] = [];
  let skipped = 0;
  const seenPaths = new Set<string>();
  const currentPaths = new Map<string, string>();

  for (const note of notes) {
    const path = noteRelativePath(note, notebooks);
    const content = noteToMarkdown(note, notebooks);
    seenPaths.add(path);
    currentPaths.set(note.id, path);
    const existing = files.find((f) => f.path === path);
    if (existing && existing.content === content) {
      skipped += 1;
      continue;
    }
    writes.push({ path, content });
  }

  const deletes: string[] = [];
  for (const file of files) {
    if (!file.path.endsWith('.md') || seenPaths.has(file.path)) continue;
    const id = extractFileId(file.content);
    // Only touch id-bearing devnote files: user files (no id) are never deleted.
    // A known id at a stale path means the note was renamed/moved — prune it.
    if (id === null) continue;
    if (!byId.has(id) || currentPaths.get(id) !== file.path) deletes.push(file.path);
  }
  return { writes, deletes, skipped };
}
