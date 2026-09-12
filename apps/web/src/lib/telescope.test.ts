import { describe, expect, test } from 'vitest';
import { parseTelescopeQuery, scopePrefix } from './telescope';

describe('parseTelescopeQuery', () => {
  test('empty query is unscoped', () => {
    expect(parseTelescopeQuery('')).toEqual({ scope: null, rest: '' });
  });
  test('bare prefix routes to its scope', () => {
    expect(parseTelescopeQuery('>')).toEqual({ scope: 'commands', rest: '' });
    expect(parseTelescopeQuery('b')).toEqual({ scope: 'notebooks', rest: '' });
    expect(parseTelescopeQuery('t')).toEqual({ scope: 'tags', rest: '' });
    expect(parseTelescopeQuery('#')).toEqual({ scope: 'toc', rest: '' });
    expect(parseTelescopeQuery('h')).toEqual({ scope: 'themes', rest: '' });
  });
  test('prefix + space filters the scope', () => {
    expect(parseTelescopeQuery('> sync')).toEqual({ scope: 'commands', rest: 'sync' });
    expect(parseTelescopeQuery('b Projects')).toEqual({ scope: 'notebooks', rest: 'Projects' });
    expect(parseTelescopeQuery('> ')).toEqual({ scope: 'commands', rest: '' });
  });
  test('symbol prefixes work glued to text', () => {
    expect(parseTelescopeQuery('>sync')).toEqual({ scope: 'commands', rest: 'sync' });
    expect(parseTelescopeQuery('#head')).toEqual({ scope: 'toc', rest: 'head' });
  });
  test('letter prefixes need the space — plain words stay global', () => {
    expect(parseTelescopeQuery('budget')).toEqual({ scope: null, rest: 'budget' });
    expect(parseTelescopeQuery('theme dark')).toEqual({ scope: null, rest: 'theme dark' });
    expect(parseTelescopeQuery('sync now')).toEqual({ scope: null, rest: 'sync now' });
  });
  test('non-prefix queries stay global', () => {
    expect(parseTelescopeQuery('x foo')).toEqual({ scope: null, rest: 'x foo' });
  });
  test('scopePrefix feeds Esc layering', () => {
    expect(scopePrefix('commands')).toBe('> ');
    expect(scopePrefix('toc')).toBe('# ');
  });
});
