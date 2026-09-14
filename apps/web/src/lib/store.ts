import type { TreeNode } from '@devnote/core';
import { getDevnoteStore } from './store/state';
import type { FullStoreState } from './store/state';
import { loadPersisted } from './store/persist';
import type { PersistedState } from './store/persist';
import { computeVisible } from './store/select';
import type { SearchScope, Selection, Settings } from './store/types';

export type { TreeNode };
export type { PersistedState, SearchScope, Selection, Settings };
export { computeVisible, loadPersisted };
export {
  activeOrSelectedIds,
  labelFor,
  sidebarTreeFor,
  statusCountsFor,
  tagCountsFor,
  workspaceScopeIdsFor,
} from './store/select';
export { DEFAULT_SETTINGS } from './store/types';
export type { ThemeId, ThemeMode } from './store/types';
export { getDevnoteStore };
export type { FullStoreState } from './store/state';

/**
 * Bound store hook — panes subscribe per-slice so typing in the editor
 * doesn't re-render the sidebar (and vice versa):
 * `const notes = useDevnote((s) => s.notes)`.
 */
export function useDevnote<T>(selector: (s: FullStoreState) => T): T {
  return getDevnoteStore()(selector);
}

/** Compat alias — prefer FullStoreState + useDevnote selectors. */
export type DevnoteStore = FullStoreState;
