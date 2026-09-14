import type { NoteSortKey } from '@devnote/core';

export type ThemeMode = 'light' | 'dark' | 'system';
/** Any bundled (`light`, `dracula`, …) or plugin theme id. */
export type ThemeId = string;

export interface Settings {
  /** Explicit default notebook; null = first root notebook. */
  defaultNotebookId: string | null;
  /** Theme id from the core registry (`light`/`dark`/`system` + community). */
  theme: ThemeId;
  wordWrap: boolean;
  /** Editor font size, px (clamped 11–18). */
  fontSize: number;
  /** Note-list order (search results always rank by relevance). */
  noteSort: NoteSortKey;
  /** Sidebar width, px (clamped 180–420). */
  sidebarWidth: number;
  /** Note-list width, px (clamped 240–520). */
  listWidth: number;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultNotebookId: null,
  theme: 'system',
  wordWrap: true,
  fontSize: 13.5,
  noteSort: 'updated',
  sidebarWidth: 240,
  listWidth: 320,
};

export type Selection =
  | { kind: 'all' }
  | { kind: 'notebook'; id: string }
  | { kind: 'trash' };

export type SearchScope = 'local' | 'global';
