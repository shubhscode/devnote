import { describe, expect, it } from 'vitest';
import { pushRevision, revisionsForNote, shouldSnapshot } from './index';

describe('shouldSnapshot', () => {
  it('skips empty new notes and unchanged content', () => {
    expect(shouldSnapshot([], 'n', '', '')).toBe(false);
    expect(shouldSnapshot([], 'n', 't', '')).toBe(true);
    const revs = pushRevision([], 'n', 't', 'b', '2026-01-01T00:00:00.000Z');
    expect(shouldSnapshot(revs, 'n', 't', 'b')).toBe(false);
    expect(shouldSnapshot(revs, 'n', 't', 'b2')).toBe(true);
  });
});

describe('pushRevision', () => {
  it('prunes oldest beyond the per-note cap', () => {
    let revs = pushRevision([], 'n', 't0', 'b0', '2026-01-01T00:00:00.000Z');
    for (let i = 1; i < 60; i++) {
      revs = pushRevision(revs, 'n', `t${i}`, 'b', `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`, 50, 1000);
    }
    expect(revisionsForNote(revs, 'n')).toHaveLength(50);
    expect(revisionsForNote(revs, 'n')[0]?.title).toBe('t59');
  });

  it('enforces the global cap across notes', () => {
    let revs = pushRevision([], 'a', 't', 'b', '2026-01-01T00:00:00.000Z', 50, 3);
    revs = pushRevision(revs, 'b', 't', 'b', '2026-01-02T00:00:00.000Z', 50, 3);
    revs = pushRevision(revs, 'c', 't', 'b', '2026-01-03T00:00:00.000Z', 50, 3);
    revs = pushRevision(revs, 'd', 't', 'b', '2026-01-04T00:00:00.000Z', 50, 3);
    expect(revs).toHaveLength(3);
    expect(revs.some((r) => r.noteId === 'a')).toBe(false);
  });
});
