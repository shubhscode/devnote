import {
  STORAGE_KEYS,
  generateId,
  isValidThemeId,
  nowIso,
  quarantineKey,
} from '@devnote/core';
import type { Note, Notebook, Revision, StorageAdapter, Template } from '@devnote/core';
import { DEFAULT_SETTINGS } from './types';
import type { Settings } from './types';

export const STORAGE_KEY = STORAGE_KEYS.db;
export const TEMPLATES_KEY = STORAGE_KEYS.templates;
export const RECENTS_KEY = STORAGE_KEYS.recents;
export const REVISIONS_KEY = STORAGE_KEYS.revisions;
export const SETTINGS_KEY = STORAGE_KEYS.settings;

function readRaw(adapter: StorageAdapter, key: string): string | null {
  try {
    return adapter.getItem(key);
  } catch {
    return null;
  }
}

/** A loaded slice plus whether its stored payload was corrupt (quarantined). */
interface Loaded<T> {
  value: T;
  corrupted: boolean;
}

export function loadSettings(adapter: StorageAdapter): Loaded<Settings> {
  const fallback = { ...DEFAULT_SETTINGS };
  const raw = readRaw(adapter, SETTINGS_KEY);
  if (raw === null) {
    // One-time migration from the Phase 0/1 theme flag.
    try {
      const legacy = adapter.getItem('devnote:theme');
      if (legacy === 'light' || legacy === 'dark') return { value: { ...fallback, theme: legacy }, corrupted: false };
    } catch { /* ignore */ }
    return { value: fallback, corrupted: false };
  }
  try {
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      value: {
        defaultNotebookId: typeof p.defaultNotebookId === 'string' ? p.defaultNotebookId : null,
        theme: typeof p.theme === 'string' && isValidThemeId(p.theme) ? p.theme : fallback.theme,
        wordWrap: typeof p.wordWrap === 'boolean' ? p.wordWrap : fallback.wordWrap,
        fontSize: typeof p.fontSize === 'number' ? Math.min(18, Math.max(11, p.fontSize)) : fallback.fontSize,
        noteSort: p.noteSort === 'created' || p.noteSort === 'title' ? p.noteSort : 'updated',
        sidebarWidth: typeof p.sidebarWidth === 'number' ? Math.min(420, Math.max(180, p.sidebarWidth)) : fallback.sidebarWidth,
        listWidth: typeof p.listWidth === 'number' ? Math.min(520, Math.max(240, p.listWidth)) : fallback.listWidth,
      },
      corrupted: false,
    };
  } catch {
    quarantineKey(adapter, SETTINGS_KEY);
    return { value: fallback, corrupted: true };
  }
}

export function seedData(): { notebooks: Notebook[]; notes: Note[] } {
  const t = nowIso();
  const inbox: Notebook = {
    id: generateId(), name: 'Inbox', parentId: null, sortOrder: 0, createdAt: t, updatedAt: t,
  };
  const projects: Notebook = {
    id: generateId(), name: 'Projects', parentId: null, sortOrder: 1, createdAt: t, updatedAt: t,
  };
  const devnote: Notebook = {
    id: generateId(), name: 'devnote', parentId: projects.id, sortOrder: 0, createdAt: t, updatedAt: t,
  };
  const notebooks = [inbox, projects, devnote];
  const mk = (notebookId: string, title: string, body: string, tags: string[]): Note => ({
    id: generateId(), title, body, notebookId, tags,
    status: 'none', pinned: false, trashed: false, createdAt: t, updatedAt: t,
  });
  const notes = [
    mk(inbox.id, 'Welcome to devnote',
      '# Welcome\n\nLocal-first notes. No subscription.\n\n- [ ] Create a notebook\n- [ ] Write with `book:`, `tag:`, `status:` search',
      ['meta']),
    mk(devnote.id, 'Roadmap', 'See PLAN.md in the repo.\n\n> [!NOTE]\n> Phase 1a: CRUD + tree.', ['plan']),
  ];
  return { notebooks, notes };
}

export function loadTemplates(adapter: StorageAdapter): Loaded<Template[]> {
  const raw = readRaw(adapter, TEMPLATES_KEY);
  if (raw === null) return { value: [], corrupted: false };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error('bad shape');
    return {
      value: parsed.filter(
        (t): t is Template =>
          typeof t === 'object' && t !== null &&
          typeof (t as Template).id === 'string' &&
          typeof (t as Template).name === 'string' &&
          typeof (t as Template).body === 'string',
      ),
      corrupted: false,
    };
  } catch {
    quarantineKey(adapter, TEMPLATES_KEY);
    return { value: [], corrupted: true };
  }
}

export function loadRecents(adapter: StorageAdapter): Loaded<string[]> {
  const raw = readRaw(adapter, RECENTS_KEY);
  if (raw === null) return { value: [], corrupted: false };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error('bad shape');
    return { value: parsed.filter((r): r is string => typeof r === 'string'), corrupted: false };
  } catch {
    quarantineKey(adapter, RECENTS_KEY);
    return { value: [], corrupted: true };
  }
}

function isRevision(v: unknown): v is Revision {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as Revision).id === 'string' &&
    typeof (v as Revision).noteId === 'string' &&
    typeof (v as Revision).title === 'string' &&
    typeof (v as Revision).body === 'string' &&
    typeof (v as Revision).createdAt === 'string'
  );
}

export function loadRevisions(adapter: StorageAdapter): Loaded<Revision[]> {
  const raw = readRaw(adapter, REVISIONS_KEY);
  if (raw === null) return { value: [], corrupted: false };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error('bad shape');
    return { value: parsed.filter(isRevision), corrupted: false };
  } catch {
    quarantineKey(adapter, REVISIONS_KEY);
    return { value: [], corrupted: true };
  }
}

export function loadDB(adapter: StorageAdapter): Loaded<{ notebooks: Notebook[]; notes: Note[] }> {
  const raw = readRaw(adapter, STORAGE_KEY);
  if (raw === null) return { value: seedData(), corrupted: false };
  try {
    const parsed = JSON.parse(raw) as { notebooks?: Notebook[]; notes?: Note[] };
    if (!Array.isArray(parsed.notebooks) || !Array.isArray(parsed.notes)) throw new Error('bad shape');
    return { value: { notebooks: parsed.notebooks, notes: parsed.notes }, corrupted: false };
  } catch {
    // Corrupt payload quarantined to devnote:corrupt:* — never overwritten silently.
    quarantineKey(adapter, STORAGE_KEY);
    return { value: seedData(), corrupted: true };
  }
}

/** Single parse of every persisted slice (Batch A: one load path for the future SQLite swap). */
export function loadPersisted(adapter: StorageAdapter) {
  const db = loadDB(adapter);
  const templates = loadTemplates(adapter);
  const recents = loadRecents(adapter);
  const revisions = loadRevisions(adapter);
  const settings = loadSettings(adapter);
  const corruptedKeys: string[] = [];
  if (db.corrupted) corruptedKeys.push(STORAGE_KEY);
  if (templates.corrupted) corruptedKeys.push(TEMPLATES_KEY);
  if (recents.corrupted) corruptedKeys.push(RECENTS_KEY);
  if (revisions.corrupted) corruptedKeys.push(REVISIONS_KEY);
  if (settings.corrupted) corruptedKeys.push(SETTINGS_KEY);
  return {
    notebooks: db.value.notebooks,
    notes: db.value.notes,
    customTemplates: templates.value,
    templateRecents: recents.value,
    revisions: revisions.value,
    settings: settings.value,
    corruptedKeys,
  };
}

export type PersistedState = ReturnType<typeof loadPersisted>;
