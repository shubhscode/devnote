import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyMatch } from './index';

describe('fuzzyMatch', () => {
  it('matches subsequences with indices', () => {
    const hit = fuzzyMatch('nb', 'Notebooks');
    expect(hit).not.toBeNull();
    expect(hit?.indices).toEqual([0, 4]);
  });

  it('rejects non-subsequences and is case-insensitive', () => {
    expect(fuzzyMatch('zx', 'Notebooks')).toBeNull();
    expect(fuzzyMatch('NB', 'notebooks')).not.toBeNull();
  });

  it('prefers word starts and consecutive runs', () => {
    const a = fuzzyMatch('dev', 'devnote project')!;
    const b = fuzzyMatch('dev', 'myadev note')!; // mid-word start scores lower
    expect(a.score).toBeGreaterThan(b.score);
    const c = fuzzyMatch('nt', 'note')!;
    const d = fuzzyMatch('nt', 'an outline text')!;
    expect(c.score).toBeGreaterThan(d.score);
  });

  it('empty query matches everything', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ score: 0, indices: [] });
  });
});

describe('fuzzyFilter', () => {
  it('filters and ranks by key', () => {
    const items = [{ n: 'New note' }, { n: 'Notebook' }, { n: 'Unrelated xyz' }];
    const res = fuzzyFilter('nb', items, (i) => i.n);
    expect(res.map((r) => r.item.n)).toEqual(['Notebook']);
    const all = fuzzyFilter('', items, (i) => i.n);
    expect(all).toHaveLength(3);
  });
});
