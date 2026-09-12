import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { fencedCodeLineRanges } from './codeblock';

function stateWith(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown()] });
}

describe('fencedCodeLineRanges', () => {
  it('maps a closed fence to its line span', () => {
    const st = stateWith('intro\n```js\nconst a = 1;\n```\noutro');
    expect(fencedCodeLineRanges(st)).toEqual([{ fromLine: 2, toLine: 4 }]);
  });

  it('covers multiple blocks, and unclosed fences run to doc end', () => {
    const st = stateWith('```py\nx = 1\n```\n\ntext\n```sh\necho hi\n```');
    expect(fencedCodeLineRanges(st)).toEqual([
      { fromLine: 1, toLine: 3 },
      { fromLine: 6, toLine: 8 },
    ]);
    // An unclosed fence swallows everything after it (CommonMark).
    expect(fencedCodeLineRanges(stateWith('```py\nx = 1'))).toEqual([{ fromLine: 1, toLine: 2 }]);
  });

  it('returns empty with no fences', () => {
    expect(fencedCodeLineRanges(stateWith('# hi\n\nplain'))).toEqual([]);
  });
});
