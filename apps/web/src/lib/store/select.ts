import {
  descendantIds,
  searchNotes,
  sortNotes,
} from '@devnote/core';
import type { Note, Notebook, NoteSortKey } from '@devnote/core';
import type { SearchScope, Selection } from './types';

/** Direct filter (no ref dependency — used inside computeVisible). */
export function filterBySelectionDirect(
  notes: Note[],
  notebooks: Notebook[],
  selection: Selection,
  expanded: string[],
): Note[] {
  if (selection.kind === 'trash') {
    return notes.filter((n) => n.trashed);
  } else if (selection.kind === 'notebook') {
    const ids = expanded.includes(selection.id)
      ? [selection.id]
      : [selection.id, ...descendantIds(notebooks, selection.id)];
    return notes.filter((n) => !n.trashed && ids.includes(n.notebookId));
  }
  return notes.filter((n) => !n.trashed);
}

export function computeVisible(
  notes: Note[],
  notebooks: Notebook[],
  selection: Selection,
  expanded: string[],
  rawQuery: string,
  _scope: SearchScope = 'global',
  sortKey: NoteSortKey = 'updated',
): Note[] {
  const base = filterBySelectionDirect(notes, notebooks, selection, expanded);
  const q = rawQuery.trim();
  if (q === '') return sortNotes(base, sortKey);
  return searchNotes(base, notebooks, q).map((s) => s.note);
}
