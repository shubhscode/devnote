import { describe, expect, it } from 'vitest';
import { backlinksFor, parseWikilinks, resolveWikilink } from './links';
import type { LinkableNote } from './links';

const mk = (over: Partial<LinkableNote> & { id: string }): LinkableNote => ({
  title: '', body: '', trashed: false, createdAt: '2026-01-01T00:00:00.000Z', ...over,
});

describe('parseWikilinks', () => {
  it('parses simple links with offsets and aliases', () => {
    const links = parseWikilinks('See [[Roadmap]] and [[roadmap|the plan]] done');
    expect(links.map((l) => [l.target, l.alias])).toEqual([['Roadmap', null], ['roadmap', 'the plan']]);
    expect(links[0]).toMatchObject({ from: 4, to: 15 });
  });

  it('ignores empty targets, unclosed and nested brackets', () => {
    expect(parseWikilinks('[[]] [[ ]]')).toEqual([]);
    expect(parseWikilinks('[[unclosed')).toEqual([]);
    // Outer opener voids, inner link still parses.
    expect(parseWikilinks('[[a [[b]]').map((l) => l.target)).toEqual(['b']);
  });

  it('skips fenced blocks and inline code', () => {
    expect(parseWikilinks('```\n[[code]]\n```')).toEqual([]);
    expect(parseWikilinks('`[[code]]` real [[ok]]')).toHaveLength(1);
    expect(parseWikilinks('`` `[[x]]` `` [[ok]]')).toHaveLength(1);
  });

  it('empty alias reads as null', () => {
    expect(parseWikilinks('[[t|]]')[0]?.alias).toBeNull();
  });
});

describe('resolveWikilink', () => {
  const notes = [
    mk({ id: 'b', title: 'Roadmap', createdAt: '2026-02-01T00:00:00.000Z' }),
    mk({ id: 'a', title: 'roadmap', createdAt: '2026-01-01T00:00:00.000Z' }),
    mk({ id: 'c', title: 'Gone', trashed: true }),
  ];
  it('matches case-insensitively, oldest first', () => {
    expect(resolveWikilink('ROADMAP', notes)?.id).toBe('a');
  });
  it('misses on blank, missing, and trashed', () => {
    expect(resolveWikilink('  ', notes)).toBeNull();
    expect(resolveWikilink('Nope', notes)).toBeNull();
    expect(resolveWikilink('Gone', notes)).toBeNull();
  });
});

describe('backlinksFor', () => {
  it('collects resolvers, skips self and trashed', () => {
    const notes = [
      mk({ id: 'hub', title: 'Hub' }),
      mk({ id: 'a', title: 'A', body: 'to [[Hub]] twice [[hub]]' }),
      mk({ id: 'b', title: 'B', body: 'to [[Hub]]' }),
      mk({ id: 't', title: 'T', body: 'to [[Hub]]', trashed: true }),
      mk({ id: 'hub2', title: 'Other', body: 'self [[Other]]' }),
    ];
    expect(backlinksFor('hub', notes)).toEqual([
      { noteId: 'a', title: 'A', count: 2 },
      { noteId: 'b', title: 'B', count: 1 },
    ]);
    expect(backlinksFor('hub2', notes)).toEqual([]);
  });
});
