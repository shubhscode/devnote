// Telescope prefix scoping (`> b t # h`) — pure helper, tested in telescope.test.ts.
export type TelescopeScope = 'commands' | 'notebooks' | 'tags' | 'toc' | 'themes';

export interface TelescopeScopeMeta {
  id: TelescopeScope;
  prefix: string;
  label: string;
  placeholder: string;
}

export const TELESCOPE_SCOPES: TelescopeScopeMeta[] = [
  { id: 'commands', prefix: '>', label: 'Commands', placeholder: 'Run a command…' },
  { id: 'notebooks', prefix: 'b', label: 'Notebooks', placeholder: 'Jump to a notebook…' },
  { id: 'tags', prefix: 't', label: 'Tags', placeholder: 'Filter by tag…' },
  { id: 'toc', prefix: '#', label: 'Contents', placeholder: 'Jump to a heading…' },
  { id: 'themes', prefix: 'h', label: 'Themes', placeholder: 'Switch theme…' },
];

/** Symbol prefixes also work glued to text (`>sync`, `#head`). */
const GLUED_PREFIXES = new Set(['>', '#']);

/**
 * Split a Telescope query into scope + filter text.
 * - Bare prefix (`>`, `b`, …) routes to its scope with an empty filter.
 * - `> sync` / `b Projects` filter that scope.
 * - Letter prefixes need the space, so plain searches like `budget`
 *   keep searching everything instead of scoping to notebooks.
 */
export function parseTelescopeQuery(query: string): { scope: TelescopeScope | null; rest: string } {
  if (query === '') return { scope: null, rest: query };
  const head = TELESCOPE_SCOPES.find((s) => s.prefix === query[0]);
  if (!head) return { scope: null, rest: query };
  const tail = query.slice(1);
  if (tail === '') return { scope: head.id, rest: '' };
  if (tail[0] === ' ' || tail[0] === '\t') return { scope: head.id, rest: tail.slice(1) };
  if (GLUED_PREFIXES.has(head.prefix)) return { scope: head.id, rest: tail.trimStart() };
  return { scope: null, rest: query };
}

/** `> sync` → `> ` (Esc layering: drop the filter, keep the scope). */
export function scopePrefix(scope: TelescopeScope): string {
  return `${TELESCOPE_SCOPES.find((s) => s.id === scope)?.prefix ?? ''} `;
}
