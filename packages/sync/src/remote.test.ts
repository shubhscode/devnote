import { describe, expect, it } from 'vitest';
import { isValidGitRemote } from './remote';

describe('isValidGitRemote', () => {
  it('accepts https/http, ssh://, and scp-like forms', () => {
    expect(isValidGitRemote('https://github.com/user/devnote.git')).toBe(true);
    expect(isValidGitRemote('https://github.com/user/devnote')).toBe(true);
    expect(isValidGitRemote('http://git.lan/user/devnote.git')).toBe(true);
    expect(isValidGitRemote('ssh://git@github.com/user/devnote.git')).toBe(true);
    expect(isValidGitRemote('git@github.com:user/devnote.git')).toBe(true);
    expect(isValidGitRemote('  git@github.com:user/devnote.git  ')).toBe(true);
  });

  it('rejects blanks, bare hosts, wrong schemes, and local paths', () => {
    expect(isValidGitRemote('')).toBe(false);
    expect(isValidGitRemote('   ')).toBe(false);
    expect(isValidGitRemote('notaurl')).toBe(false);
    expect(isValidGitRemote('github.com/user/devnote')).toBe(false);
    expect(isValidGitRemote('ftp://host/user/repo.git')).toBe(false);
    expect(isValidGitRemote('https://')).toBe(false);
    expect(isValidGitRemote('https://host')).toBe(false);
    expect(isValidGitRemote('git@github.com')).toBe(false);
    expect(isValidGitRemote('/home/user/devnote')).toBe(false);
    expect(isValidGitRemote('https://host/a b.git')).toBe(false);
  });
});
