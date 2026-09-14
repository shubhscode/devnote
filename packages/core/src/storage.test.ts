import { describe, expect, it } from 'vitest';
import {
  CORRUPT_PREFIX,
  MemoryStorage,
  STORAGE_KEYS,
  isQuotaError,
  quarantineKey,
} from './storage';

describe('StorageAdapter', () => {
  it('keys stay stable (store + sync depend on them)', () => {
    expect(STORAGE_KEYS.db).toBe('devnote:v1');
    expect(STORAGE_KEYS.templates).toBe('devnote:templates:v1');
    expect(STORAGE_KEYS.recents).toBe('devnote:template-recents:v1');
    expect(STORAGE_KEYS.revisions).toBe('devnote:revisions:v1');
    expect(STORAGE_KEYS.settings).toBe('devnote:settings:v1');
  });

  it('MemoryStorage round-trips + miss returns null', () => {
    const s = new MemoryStorage();
    expect(s.getItem('k')).toBe(null);
    s.setItem('k', 'v');
    expect(s.getItem('k')).toBe('v');
    s.removeItem('k');
    expect(s.getItem('k')).toBe(null);
  });

  it('quarantine moves raw aside and clears original', () => {
    const s = new MemoryStorage({ [STORAGE_KEYS.db]: '{bad json' });
    const backup = quarantineKey(s, STORAGE_KEYS.db, 'stamp1');
    expect(backup).toBe(`${CORRUPT_PREFIX}${STORAGE_KEYS.db}:stamp1`);
    expect(s.getItem(backup as string)).toBe('{bad json');
    expect(s.getItem(STORAGE_KEYS.db)).toBe(null);
  });

  it('quarantine no-ops on missing key', () => {
    const s = new MemoryStorage();
    expect(quarantineKey(s, STORAGE_KEYS.db)).toBe(null);
  });

  it('quarantine never throws on hostile storage', () => {
    const hostile = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    };
    expect(quarantineKey(hostile, STORAGE_KEYS.db)).toBe(null);
  });

  it('detects quota errors across browsers', () => {
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError(new Error('plain'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
    expect(isQuotaError('QuotaExceededError')).toBe(false);
  });
});
