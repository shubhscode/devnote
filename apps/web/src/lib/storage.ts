import type { StorageAdapter } from '@devnote/core';

/** Default adapter: window.localStorage. Pass a custom adapter to useDevnoteStore for tests. */
export const localStorageAdapter: StorageAdapter = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};
