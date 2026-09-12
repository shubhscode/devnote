import { describe, expect, it } from 'vitest';
import { extractToc } from './toc';

describe('extractToc', () => {
  it('extracts ATX headings with levels and positions', () => {
    const doc = '# Title\n\nSome text\n\n### Deep dive\n';
    const toc = extractToc(doc);
    expect(toc).toMatchObject([
      { kind: 'heading', level: 1, text: 'Title', pos: 0 },
      { kind: 'heading', level: 3, text: 'Deep dive' },
    ]);
  });

  it('extracts task items with checked state', () => {
    const doc = '- [ ] todo\n- [x] done\n- plain\n';
    const toc = extractToc(doc);
    expect(toc).toMatchObject([
      { kind: 'task', checked: false, text: 'todo' },
      { kind: 'task', checked: true, text: 'done' },
    ]);
    expect(toc).toHaveLength(2);
  });

  it('ignores hashes inside fenced code', () => {
    const doc = '```js\n# not a heading\n```\n\n# Real\n';
    const toc = extractToc(doc);
    expect(toc).toMatchObject([{ kind: 'heading', level: 1, text: 'Real' }]);
    expect(toc).toHaveLength(1);
  });
});
