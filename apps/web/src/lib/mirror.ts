// Tauri file-mirror glue (~/devnote). Desktop only — every call throws a
// friendly error in browsers. Commands are implemented in
// apps/desktop/src-tauri/src/mirror.rs.
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export interface MirrorFileDTO {
  path: string;
  content: string;
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error('File mirror needs the DevNote desktop app');
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(cmd, args);
}

export function mirrorRootPath(): Promise<string> {
  return invoke<string>('mirror_root_path');
}

export function mirrorWriteFile(relativePath: string, content: string): Promise<void> {
  return invoke<void>('mirror_write', { relativePath, content });
}

export function mirrorReadFiles(): Promise<MirrorFileDTO[]> {
  return invoke<MirrorFileDTO[]>('mirror_read');
}

export function mirrorDeleteFile(relativePath: string): Promise<void> {
  return invoke<void>('mirror_delete', { relativePath });
}

export interface SyncWrite {
  path: string;
  content: string;
}

export function mirrorSync(writes: SyncWrite[], deletes: string[]): Promise<void> {
  return invoke<void>('mirror_sync', { writes, deletes });
}

/**
 * Start the native ~/devnote watcher (idempotent; desktop only).
 * True when this call started it, false when already running.
 */
export function mirrorWatchStart(): Promise<boolean> {
  return invoke<boolean>('mirror_watch_start');
}

/** Subscribe to native mirror change events. No-op off-desktop. */
export async function onMirrorChanged(cb: () => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { MIRROR_CHANGED_EVENT } = await import('./mirrorWatch');
  const { listen } = await import('@tauri-apps/api/event');
  const unlisten = await listen(MIRROR_CHANGED_EVENT, () => cb());
  return unlisten;
}
