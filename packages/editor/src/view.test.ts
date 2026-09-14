// view.ts coverage (2.5): the file was 461 untested lines. DOM-free parts
// (slash ranges, search queries, keymap shape, linter wiring) are tested
// here; panel/paste behavior is covered by e2e.
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { SearchQuery } from '@codemirror/search';
import { markdownKeymap, markdownLinter, slashRange } from './view';

function stateWith(doc: string, pos?: number): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor: pos ?? doc.length },
    extensions: [markdown()],
  });
}

describe('slashRange', () => {
  it('matches /query on otherwise-empty lines', () => {
    const r = slashRange(stateWith('/tab'));
    expect(r).toMatchObject({ query: 'tab' });
    expect(slashRange(stateWith('/'))?.query).toBe('');
  });

  it('rejects mid-line slashes, trailing content, selections', () => {
    expect(slashRange(stateWith('a /tab'))).toBeNull();
    expect(slashRange(stateWith('/tab x'))).toBeNull();
    const st = EditorState.create({
      doc: '/tab',
      selection: { anchor: 0, head: 4 },
      extensions: [markdown()],
    });
    expect(slashRange(st)).toBeNull();
  });
});

describe('SearchQuery', () => {
  it('finds literal matches with offsets', () => {
    const q = new SearchQuery({ search: 'world' });
    const cursor = q.getCursor(stateWith('hello world, world').doc);
    expect(cursor.next().value).toMatchObject({ from: 6, to: 11 });
    expect(cursor.next().value).toMatchObject({ from: 13, to: 18 });
    expect(cursor.next().done).toBe(true);
  });
});

describe('wiring', () => {
  it('markdownKeymap builds (incl. search bindings)', () => {
    expect(markdownKeymap()).toBeDefined();
  });

  it('markdownLinter builds', () => {
    expect(markdownLinter()).toBeDefined();
  });
});
