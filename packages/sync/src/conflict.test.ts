import { describe, expect, it } from 'vitest';
import { fileUpdatedAt, readFrontmatter } from '@devnote/core';
import { conflictPath, resolveConflict, sanitizeDevice } from './conflict';

const NOW = '2026-09-12T12:00:00.000Z';

function file(id: string, title: string, updatedAt: string, body = 'hello\n'): string {
  return [
    '---',
    `id: ${id}`,
    `title: ${title}`,
    'notebook: Inbox',
    'tags: []',
    'status: none',
    'pinned: false',
    'trashed: false',
    'createdAt: 2026-01-01T00:00:00.000Z',
    `updatedAt: ${updatedAt}`,
    '---',
    '',
    body,
  ].join('\n');
}

describe('sanitizeDevice', () => {
  it('lowercases and dashes unsafe chars', () => {
    expect(sanitizeDevice("Ramesh's MacBook Pro!")).toBe('ramesh-s-macbook-pro');
  });
  it('falls back when empty', () => {
    expect(sanitizeDevice('  ')).toBe('device');
  });
});

describe('conflictPath', () => {
  it('inserts suffix before extension, keeps dir', () => {
    expect(conflictPath('Notes/foo-abc12345.md', 'laptop')).toBe('Notes/foo-abc12345.conflict-laptop.md');
    expect(conflictPath('a.md', 'Laptop 2')).toBe('a.conflict-laptop-2.md');
  });
});

describe('resolveConflict', () => {
  it('newer theirs wins and looses file is preserved', () => {
    const ours = file('ours-id', 'Notes', '2026-09-10T00:00:00.000Z', 'local text\n');
    const theirs = file('theirs-id', 'Notes', '2026-09-11T00:00:00.000Z', 'remote text\n');
    const res = resolveConflict(ours, theirs, 'Inbox/notes-ours-id.md', 'laptop', NOW);
    expect(res.winner).toBe('theirs');
    expect(res.resolved).toBe(theirs);
    expect(res.conflict).not.toBeNull();
    expect(res.conflict!.path).toBe('Inbox/notes-ours-id.conflict-laptop.md');
    const fm = readFrontmatter(res.conflict!.content);
    expect(fm.data.id).not.toBe('ours-id');
    expect(fm.data.id).not.toBe('theirs-id');
    expect(fm.data.title).toBe('Notes (conflict laptop)');
    expect(fm.data.updatedAt).toBe(NOW);
    expect(fm.body).toContain('local text');
  });

  it('newer ours wins', () => {
    const ours = file('o', 'O', '2026-09-11T00:00:00.000Z');
    const theirs = file('t', 'T', '2026-09-10T00:00:00.000Z');
    const res = resolveConflict(ours, theirs, 'a.md', 'laptop', NOW);
    expect(res.winner).toBe('ours');
    expect(res.resolved).toBe(ours);
    expect(readFrontmatter(res.conflict!.content).data.title).toBe('T (conflict laptop)');
  });

  it('tie favors ours', () => {
    const at = '2026-09-11T00:00:00.000Z';
    const res = resolveConflict(file('o', 'O', at), file('t', 'T', at), 'a.md', 'phone', NOW);
    expect(res.winner).toBe('ours');
  });

  it('missing frontmatter dates fall back to ours', () => {
    const res = resolveConflict('plain local\n', 'plain remote\n', 'a.md', 'phone', NOW);
    expect(res.winner).toBe('ours');
    expect(res.resolved).toBe('plain local\n');
    const fm = readFrontmatter(res.conflict!.content);
    expect(fm.data.title).toBe('Untitled (conflict phone)');
    expect(fileUpdatedAt(res.conflict!.content)).toBe(NOW);
  });

  it('identical content yields no conflict file', () => {
    const same = file('o', 'O', '2026-09-11T00:00:00.000Z');
    const res = resolveConflict(same, same, 'a.md', 'laptop', NOW);
    expect(res.conflict).toBeNull();
  });
});
