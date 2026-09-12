import { describe, expect, test, vi } from 'vitest';
import { checkForUpdates, isNewerVersion, shouldRecheck } from './updates';

describe('isNewerVersion', () => {
  test('newer patch/minor/major wins (leading v optional)', () => {
    expect(isNewerVersion('v0.0.2', '0.0.1')).toBe(true);
    expect(isNewerVersion('0.1.0', 'v0.0.99')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true);
  });
  test('compares numerically, not lexicographically', () => {
    expect(isNewerVersion('v0.0.10', 'v0.0.9')).toBe(true);
    expect(isNewerVersion('v0.0.9', 'v0.0.10')).toBe(false);
  });
  test('equal or older is not newer', () => {
    expect(isNewerVersion('v0.0.1', '0.0.1')).toBe(false);
    expect(isNewerVersion('v0.0.1', 'v0.0.2')).toBe(false);
  });
});

describe('checkForUpdates', () => {
  const release = { tag_name: 'v0.0.2', name: 'DevNote v0.0.2', html_url: 'https://github.com/o/r/releases/tag/v0.0.2', body: 'notes' };
  const okFetch = () =>
    vi.fn(async () => ({ ok: true, json: async () => release }) as unknown as Response);

  test('returns the release when newer', async () => {
    const rel = await checkForUpdates('0.0.1', 'o', 'r', okFetch() as unknown as typeof fetch);
    expect(rel?.tag).toBe('v0.0.2');
    expect(rel?.url).toContain('v0.0.2');
  });
  test('null when up to date', async () => {
    const rel = await checkForUpdates('v0.0.2', 'o', 'r', okFetch() as unknown as typeof fetch);
    expect(rel).toBeNull();
  });
  test('null on network failure, bad status, or malformed payload', async () => {
    const throwing = vi.fn(async () => { throw new Error('offline'); });
    expect(await checkForUpdates('0.0.1', 'o', 'r', throwing as unknown as typeof fetch)).toBeNull();
    const badStatus = vi.fn(async () => ({ ok: false }) as unknown as Response);
    expect(await checkForUpdates('0.0.1', 'o', 'r', badStatus as unknown as typeof fetch)).toBeNull();
    const malformed = vi.fn(async () => ({ ok: true, json: async () => ({ nope: 1 }) }) as unknown as Response);
    expect(await checkForUpdates('0.0.1', 'o', 'r', malformed as unknown as typeof fetch)).toBeNull();
  });
});

describe('shouldRecheck', () => {
  test('first run and stale checks recheck; fresh checks skip', () => {
    expect(shouldRecheck(null)).toBe(true);
    expect(shouldRecheck(Date.now() - 25 * 60 * 60 * 1000)).toBe(true);
    expect(shouldRecheck(Date.now())).toBe(false);
  });
});
