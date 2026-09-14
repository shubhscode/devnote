import type { SetStateAction } from 'react';
import { create } from 'zustand';
import type { Note, Notebook, StorageAdapter, Template, Revision } from '@devnote/core';
import type { SyncState } from '@devnote/sync';
import { localStorageAdapter } from '../storage';
import { loadPersisted } from './persist';
import type { SearchScope, Selection, Settings } from './types';

/** Full store shape. Slices migrate here one at a time (Track 1.1); the
 *  `useDevnoteStore` hook keeps owning whatever hasn't moved yet. */
export interface DevnoteState {
  // Data slice
  notebooks: Notebook[];
  notes: Note[];
  // UI slice
  selection: Selection;
  activeNoteId: string | null;
  selectedIds: string[];
  query: string;
  scope: SearchScope;
  workspaceId: string | null;
  expanded: string[];
  past: string[];
  future: string[];
  notice: string | null;
  // Library slice
  customTemplates: Template[];
  templateRecents: string[];
  revisions: Revision[];
  settings: Settings;
  // Transient
  externalBodyWrite: { noteId: string; body: string; seq: number } | null;
  // Sync slice
  mirrorDir: string | null;
  syncState: SyncState;
  syncDevice: string;
  remoteUrl: string | null;
  syncBusy: boolean;
  /** Keys whose stored payload was corrupt (quarantined on load). */
  corruptedKeys: string[];
}

export type DevnoteStoreApi = ReturnType<typeof createDevnoteStore>;

export function createDevnoteStore(adapter: StorageAdapter = localStorageAdapter) {
  const initial = loadPersisted(adapter);
  return create<DevnoteState>()(() => ({
    notebooks: initial.notebooks,
    notes: initial.notes,
    selection: { kind: 'all' },
    activeNoteId: initial.notes[0]?.id ?? null,
    selectedIds: [],
    query: '',
    scope: 'local',
    workspaceId: null,
    expanded: [],
    past: [],
    future: [],
    notice: null,
    customTemplates: initial.customTemplates,
    templateRecents: initial.templateRecents,
    revisions: initial.revisions,
    settings: initial.settings,
    externalBodyWrite: null,
    mirrorDir: null,
    syncState: 'no-repo',
    syncDevice: 'device',
    remoteUrl: null,
    syncBusy: false,
    corruptedKeys: initial.corruptedKeys,
  }));
}

let singleton: DevnoteStoreApi | null = null;

/** Default singleton (what `App` uses); custom adapters get their own store (tests). */
export function getDevnoteStore(adapter: StorageAdapter = localStorageAdapter): DevnoteStoreApi {
  if (adapter === localStorageAdapter) {
    singleton ??= createDevnoteStore(adapter);
    return singleton;
  }
  return createDevnoteStore(adapter);
}

/** Route a React-style `setState` (value or updater) into the zustand store. */
export function setStoreState<T>(api: DevnoteStoreApi, key: keyof DevnoteState, update: SetStateAction<T>) {
  api.setState((s) => ({
    [key]: typeof update === 'function' ? (update as (prev: T) => T)(s[key] as T) : update,
  }) as Partial<DevnoteState>);
}
