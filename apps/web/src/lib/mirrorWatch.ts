// Mirror-watch contract shared by the Rust emitter (`watch.rs`) and the
// web subscriber (`mirror.ts` + `App.tsx`). One source of truth so the
// cross-language event name can't drift silently.
export const MIRROR_CHANGED_EVENT = 'mirror-changed';

/** Extra frontend debounce after the native quiet-period coalescing. */
export const WATCH_DEBOUNCE_MS = 500;

export interface WatchGate {
  syncBusy: boolean;
  syncState: string;
}

/**
 * Auto-import only when safe: never mid-sync, and never while a merge
 * conflict is waiting on the user (an import could mix loser files into
 * the resolution). Own exports are harmless — they re-import as no-ops.
 */
export function shouldRefreshFromDisk(gate: WatchGate): boolean {
  return !gate.syncBusy && gate.syncState !== 'conflict';
}
