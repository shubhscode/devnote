import { describe, expect, it } from 'vitest';
import {
  classifySyncState,
  conflictedPaths,
  parsePorcelain,
  syncCommitMessage,
  SYNC_STATE_LABEL,
} from './git';

describe('parsePorcelain', () => {
  it('parses branch tracking with ahead/behind', () => {
    const raw = '## main...origin/main [ahead 1, behind 2]\n M notes/a.md\n?? notes/b.md\n';
    const s = parsePorcelain(raw);
    expect(s.branch).toBe('main');
    expect(s.upstream).toBe('origin/main');
    expect(s.ahead).toBe(1);
    expect(s.behind).toBe(2);
    expect(s.changes).toEqual([
      { path: 'notes/a.md', status: 'modified' },
      { path: 'notes/b.md', status: 'untracked' },
    ]);
  });

  it('parses clean tracked branch', () => {
    const s = parsePorcelain('## main...origin/main\n');
    expect(s).toMatchObject({ branch: 'main', upstream: 'origin/main', ahead: 0, behind: 0 });
    expect(s.changes).toEqual([]);
  });

  it('parses unborn branch', () => {
    const s = parsePorcelain('## No commits yet on main\n?? a.md\n');
    expect(s.branch).toBe('main');
    expect(s.upstream).toBeNull();
    expect(s.changes).toEqual([{ path: 'a.md', status: 'untracked' }]);
  });

  it('parses detached HEAD', () => {
    const s = parsePorcelain('## HEAD (no branch)\nM  a.md\n');
    expect(s.branch).toBeNull();
    expect(s.changes[0]).toEqual({ path: 'a.md', status: 'modified' });
  });

  it('parses gone upstream', () => {
    const s = parsePorcelain('## main...origin/main [gone]\n');
    expect(s.upstreamGone).toBe(true);
    expect(s.branch).toBe('main');
  });

  it('classifies conflict codes and rename destination', () => {
    const s = parsePorcelain('UU a.md\nAA b.md\nR  old.md -> new.md\n D c.md\nA  d.md\n');
    expect(s.changes).toEqual([
      { path: 'a.md', status: 'conflicted' },
      { path: 'b.md', status: 'conflicted' },
      { path: 'new.md', status: 'renamed' },
      { path: 'c.md', status: 'deleted' },
      { path: 'd.md', status: 'added' },
    ]);
  });
});

describe('classifySyncState', () => {
  const base = { hasGit: true, hasRepo: true };
  it('reports missing git/repo first', () => {
    expect(classifySyncState({ hasGit: false, hasRepo: true, status: parsePorcelain('') })).toBe('no-git');
    expect(classifySyncState({ hasGit: true, hasRepo: false, status: parsePorcelain('') })).toBe('no-repo');
  });
  it('clean when no changes and even', () => {
    expect(classifySyncState({ ...base, status: parsePorcelain('## main...origin/main\n') })).toBe('clean');
  });
  it('dirty on untracked', () => {
    expect(classifySyncState({ ...base, status: parsePorcelain('## main...origin/main\n?? a.md\n') })).toBe('dirty');
  });
  it('ahead / behind / diverged', () => {
    expect(classifySyncState({ ...base, status: parsePorcelain('## main...origin/main [ahead 1]\n') })).toBe('ahead');
    expect(classifySyncState({ ...base, status: parsePorcelain('## main...origin/main [behind 1]\n') })).toBe('behind');
    expect(classifySyncState({ ...base, status: parsePorcelain('## main...origin/main [ahead 1, behind 1]\n') })).toBe('diverged');
  });
  it('conflict wins over all', () => {
    expect(classifySyncState({ ...base, status: parsePorcelain('## main...origin/main [ahead 2, behind 3]\nUU a.md\n') })).toBe('conflict');
  });
  it('ignored entries do not mark dirty', () => {
    expect(classifySyncState({ ...base, status: parsePorcelain('## main...origin/main\n!! .cache/x\n') })).toBe('clean');
  });
});

describe('helpers', () => {
  it('lists conflicted paths', () => {
    expect(conflictedPaths(parsePorcelain('UU a.md\n M b.md\n'))).toEqual(['a.md']);
  });
  it('builds commit subject', () => {
    expect(syncCommitMessage('2026-09-12T10:00:00Z', 'laptop')).toBe('devnote: sync 2026-09-12T10:00:00Z (laptop)');
  });
  it('every state has a label', () => {
    for (const v of Object.values(SYNC_STATE_LABEL)) expect(v.length).toBeGreaterThan(0);
  });
});
