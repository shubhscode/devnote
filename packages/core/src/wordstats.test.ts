import { describe, expect, it } from 'vitest';
import { wordStats } from './wordstats';

describe('wordStats', () => {
  it('empty body is all zeros', () => {
    expect(wordStats('')).toEqual({ words: 0, chars: 0, readingMinutes: 0 });
  });

  it('counts prose words and code points (markup tokens count)', () => {
    const s = wordStats('# Hi\n\nhello world');
    expect(s.words).toBe(4); // '#', Hi, hello, world
    expect(s.chars).toBe([...'# Hi\n\nhello world'].length);
    expect(s.readingMinutes).toBe(1);
  });

  it('skips fenced code blocks but counts inline code', () => {
    const body = 'intro line\n\n```ts\nconst x = 1;\nmore code here\n```\n\n`inline` tail';
    expect(wordStats(body).words).toBe(4); // intro line `inline` tail
  });

  it('unclosed fence hides the rest (safer than counting code)', () => {
    expect(wordStats('prose here\n```\ncode code code').words).toBe(2);
  });

  it('reading time ceils at 220 wpm', () => {
    const w220 = Array(220).fill('w').join(' ');
    const w221 = `${w220} extra`;
    expect(wordStats(w220).readingMinutes).toBe(1);
    expect(wordStats(w221).readingMinutes).toBe(2);
  });
});
