// @devnote/core — persistence boundary. Pure TS: no react, no fs, no window.
// SQLite (Phase 1.6) swaps the adapter; features build against this interface.

/** localStorage keys owned by devnote. Ephemeral UI keys (viewmode, update-check) stay out. */
export const STORAGE_KEYS = {
  db: 'devnote:v1',
  templates: 'devnote:templates:v1',
  recents: 'devnote:template-recents:v1',
  revisions: 'devnote:revisions:v1',
  settings: 'devnote:settings:v1',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** Minimal key-value surface. localStorage satisfies it; SQLite adapter will too. */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory adapter for tests and non-browser hosts. */
export class MemoryStorage implements StorageAdapter {
  private map = new Map<string, string>();
  constructor(seed?: Record<string, string>) {
    if (seed) for (const [k, v] of Object.entries(seed)) this.map.set(k, v);
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** Backup-key prefix for quarantined (corrupt) payloads. */
export const CORRUPT_PREFIX = 'devnote:corrupt:';

/**
 * Move a raw payload aside so a corrupt write never gets overwritten silently.
 * Returns the backup key, or null when nothing was stored under `key`.
 * Never throws — quarantine must not break the load path.
 */
export function quarantineKey(storage: StorageAdapter, key: string, stamp?: string): string | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const backupKey = `${CORRUPT_PREFIX}${key}:${stamp ?? new Date().toISOString().replace(/[:.]/g, '-')}`;
  try {
    storage.setItem(backupKey, raw);
  } catch {
    return null;
  }
  try {
    storage.removeItem(key);
  } catch {
    // Backup kept; original may linger. Caller still falls back to seed.
  }
  return backupKey;
}

/** True for quota/overflow failures across browsers (name, code, number). */
export function isQuotaError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const err = e as { name?: unknown; code?: unknown; number?: unknown };
  if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  if (err.code === 22 || err.code === 1014) return true;
  if (err.number === -2147024882) return true;
  return false;
}
