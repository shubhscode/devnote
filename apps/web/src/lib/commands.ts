// Canonical command registry metadata (ids, titles, default bindings).
// Used by Telescope, the Preferences shortcuts tab, and App's command runner.
// IDs are kebab-case `core:*` (AGENTS.md §5). Full remapping lands in Phase 4.
export interface CommandMeta {
  id: string;
  title: string;
  binding?: string; // 'mod' = Cmd on macOS, Ctrl elsewhere
}

export const COMMAND_META: CommandMeta[] = [
  { id: 'core:new-note', title: 'New note', binding: 'mod+N' },
  { id: 'core:new-notebook', title: 'New notebook' },
  { id: 'core:choose-template', title: 'Choose a template', binding: 'mod+T' },
  { id: 'core:toggle-telescope', title: 'Toggle Telescope', binding: 'mod+K' },
  { id: 'core:toggle-preview', title: 'Toggle edit/preview', binding: 'mod+E' },
  { id: 'core:toggle-side-by-side', title: 'Toggle side-by-side (split)', binding: 'mod+P' },
  { id: 'core:distraction-free', title: 'Toggle distraction-free', binding: 'mod⇧D' },
  { id: 'core:toggle-sidebar', title: 'Toggle sidebar', binding: 'mod+/' },
  { id: 'core:toggle-list', title: 'Toggle note list', binding: 'mod+\\' },
  { id: 'core:focus-workspace', title: 'Focus notebook as workspace', binding: 'mod+Enter' },
  { id: 'core:exit-workspace', title: 'Exit workspace (show all)' },
  { id: 'core:toggle-theme', title: 'Toggle light/dark theme' },
  { id: 'core:open-preferences', title: 'Open preferences', binding: 'mod+,' },
  { id: 'core:navigate-back', title: 'Go to previous note', binding: 'mod+[' },
  { id: 'core:navigate-forward', title: 'Go to next note', binding: 'mod+]' },
  { id: 'core:find', title: 'Focus search', binding: 'mod⇧F' },
  { id: 'core:find-global', title: 'Search all notebooks' },
  { id: 'core:toggle-search-scope', title: 'Toggle search scope (local/global)' },
  { id: 'core:toggle-pin', title: 'Pin/unpin note' },
  { id: 'core:show-history', title: 'Show revision history' },
  { id: 'core:duplicate-note', title: 'Duplicate note(s)', binding: 'mod+D' },
  { id: 'core:trash-note', title: 'Move note(s) to trash', binding: 'mod+⌫' },
  { id: 'core:sync-now', title: 'Sync now (git)', binding: 'mod⇧S' },
  { id: 'core:export-mirror', title: 'Export notes to ~/devnote' },
  { id: 'core:import-mirror', title: 'Import notes from ~/devnote' },
  { id: 'core:check-for-updates', title: 'Check for updates' },
];

export const COMMAND_IDS: string[] = COMMAND_META.map((m) => m.id);
