// Subsequence fuzzy matching for Telescope.
// Case-insensitive; bonuses for word starts, consecutive runs, exact case.
// Returns matched indices for <mark> highlighting. Empty query matches all.
export interface FuzzyHit {
  score: number;
  indices: number[];
}

function isWordStart(target: string, i: number): boolean {
  if (i === 0) return true;
  const prev = target[i - 1] ?? '';
  return prev === ' ' || prev === '/' || prev === '-' || prev === '_' || prev === ':' || prev === '.';
}

export function fuzzyMatch(query: string, target: string): FuzzyHit | null {
  if (query === '') return { score: 0, indices: [] };
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const indices: number[] = [];
  let score = 0;
  let ti = 0;
  let prevMatch = -2;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]!;
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    indices.push(found);
    score += 10;
    if (isWordStart(target, found)) score += 15;
    if (found === prevMatch + 1) score += 20;
    if (target[found] === query[qi]) score += 5; // exact-case bonus
    prevMatch = found;
    ti = found + 1;
  }
  // Prefer compact matches: penalize span length.
  score -= (indices[indices.length - 1]! - indices[0]!) * 0.5;
  return { score, indices };
}

/** Filter + rank items by fuzzy key. Empty query returns all (score 0). */
export function fuzzyFilter<T>(query: string, items: T[], key: (item: T) => string): { item: T; hit: FuzzyHit }[] {
  const out: { item: T; hit: FuzzyHit }[] = [];
  for (const item of items) {
    const hit = fuzzyMatch(query, key(item));
    if (hit) out.push({ item, hit });
  }
  out.sort((a, b) => b.hit.score - a.hit.score);
  return out;
}
