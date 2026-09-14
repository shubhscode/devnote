// Tag rename / merge / delete. Pure functions — no IO.
// Comparison is case-insensitive (`JS` = `js`); the target name keeps its given casing.
import { nowIso } from './types';
import type { Note } from './types';

/** Trimmed tag. Empty string = invalid (callers throw). */
export function normalizeTagName(name: string): string {
  return name.trim();
}

/** Comparison key: case-insensitive, trimmed. */
export function tagKey(name: string): string {
  return name.trim().toLowerCase();
}

function requireValidTag(name: string, what: string): string {
  const clean = normalizeTagName(name);
  if (clean === '') throw new Error(`invalid ${what}: tag name must not be blank`);
  return clean;
}

/**
 * Rename a tag across all notes (case-insensitive match, trashed included).
 * Returns unchanged array when no note carries the tag. Throws on blank names.
 * Notes already carrying the target (any casing) get deduped, order kept.
 */
export function renameTag(notes: Note[], oldName: string, newName: string): Note[] {
  const from = tagKey(requireValidTag(oldName, 'old tag'));
  const to = requireValidTag(newName, 'new tag');
  const next = notes.map((n) => {
    if (!n.tags.some((t) => tagKey(t) === from)) return n;
    const tags: string[] = [];
    const seen = new Set<string>();
    for (const t of n.tags) {
      const replacement = tagKey(t) === from ? to : t;
      const k = tagKey(replacement);
      if (!seen.has(k)) {
        seen.add(k);
        tags.push(replacement);
      }
    }
    return { ...n, tags, updatedAt: nowIso() };
  });
  return next;
}

/**
 * Merge several tags into one (case-insensitive). `from` entries equal to the
 * target (any casing) are skipped. Throws when target blank or `from` empty.
 */
export function mergeTags(notes: Note[], from: string[], into: string): Note[] {
  const to = requireValidTag(into, 'target tag');
  const sources = from.map((f) => tagKey(requireValidTag(f, 'source tag'))).filter((k) => k !== tagKey(to));
  if (sources.length === 0) throw new Error('nothing to merge: source tags are blank or equal to the target');
  const src = new Set(sources);
  return notes.map((n) => {
    if (!n.tags.some((t) => src.has(tagKey(t)))) return n;
    const tags: string[] = [];
    const seen = new Set<string>();
    for (const t of n.tags) {
      const replacement = src.has(tagKey(t)) ? to : t;
      const k = tagKey(replacement);
      if (!seen.has(k)) {
        seen.add(k);
        tags.push(replacement);
      }
    }
    return { ...n, tags, updatedAt: nowIso() };
  });
}

/**
 * Delete a tag from all notes (case-insensitive, trashed included).
 * Unused tags vanish on their own — tags are derived, never stored.
 */
export function untagNotes(notes: Note[], name: string): Note[] {
  const key = tagKey(requireValidTag(name, 'tag'));
  return notes.map((n) => {
    if (!n.tags.some((t) => tagKey(t) === key)) return n;
    return { ...n, tags: n.tags.filter((t) => tagKey(t) !== key), updatedAt: nowIso() };
  });
}
