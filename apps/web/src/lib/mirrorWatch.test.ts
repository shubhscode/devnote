import { describe, expect, it } from 'vitest';
import { MIRROR_CHANGED_EVENT, WATCH_DEBOUNCE_MS, shouldRefreshFromDisk } from './mirrorWatch';

describe('mirror watch contract', () => {
  it('event name matches the Rust emitter (watch.rs)', () => {
    expect(MIRROR_CHANGED_EVENT).toBe('mirror-changed');
  });

  it('debounce is positive and under the native quiet period', () => {
    expect(WATCH_DEBOUNCE_MS).toBeGreaterThan(0);
    expect(WATCH_DEBOUNCE_MS).toBeLessThanOrEqual(750);
  });
});

describe('shouldRefreshFromDisk', () => {
  it('refreshes when idle and clean', () => {
    expect(shouldRefreshFromDisk({ syncBusy: false, syncState: 'clean' })).toBe(true);
    expect(shouldRefreshFromDisk({ syncBusy: false, syncState: 'no-repo' })).toBe(true);
  });

  it('skips mid-sync so watcher events never race syncNow', () => {
    expect(shouldRefreshFromDisk({ syncBusy: true, syncState: 'clean' })).toBe(false);
  });

  it('skips during an unresolved conflict so loser files stay reviewable', () => {
    expect(shouldRefreshFromDisk({ syncBusy: false, syncState: 'conflict' })).toBe(false);
  });
});
