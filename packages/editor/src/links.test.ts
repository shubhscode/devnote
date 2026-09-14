import { describe, expect, it } from 'vitest';
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { linkCompleter, linkRange, setLinkTitles } from './links';

function stateWith(doc: string, pos?: number): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor: pos ?? doc.length },
    extensions: [markdown()],
  });
}

function ctxFor(doc: string, pos?: number, explicit = false): CompletionContext {
  const state = stateWith(doc, pos);
  return new CompletionContext(state, pos ?? doc.length, explicit);
}

describe('linkRange', () => {
  it('detects [[query at the cursor', () => {
    const r = linkRange(stateWith('see [[road'));
    expect(r).toMatchObject({ query: 'road' });
    expect(r!.to - r!.from).toBe(4);
  });

  it('rejects closed links, plain text, and non-empty selections', () => {
    expect(linkRange(stateWith('see [[road]]'))).toBeNull();
    expect(linkRange(stateWith('plain text'))).toBeNull();
    const st = EditorState.create({
      doc: 'see [[ro',
      selection: { anchor: 5, head: 8 },
      extensions: [markdown()],
    });
    expect(linkRange(st)).toBeNull();
  });
});

describe('linkCompleter', () => {
  setLinkTitles(['Roadmap', 'Road trip', 'Inbox']);

  it('offers substring-filtered titles, capped', () => {
    const res = linkCompleter(ctxFor('see [[road'));
    expect(res?.options.map((o) => o.label)).toEqual(['Roadmap', 'Road trip']);
  });

  it('lists everything on bare [[ and stays out of code', () => {
    expect(linkCompleter(ctxFor('see [['))?.options).toHaveLength(3);
    expect(linkCompleter(ctxFor('```\nsee [['))).toBeNull();
    expect(linkCompleter(ctxFor('see [[zzz'))).toBeNull();
  });

  it('apply replaces [[query with the full link', () => {
    const doc = 'see [[road';
    const state = stateWith(doc);
    const res = linkCompleter(ctxFor(doc));
    const opt = res!.options[0]!;
    let dispatched: { changes: { insert: string }; selection: { anchor: number } } | null = null;
    (opt.apply as (v: unknown) => void)({
      dispatch: (tr: { changes: { insert: string }; selection: { anchor: number } }) => { dispatched = tr; },
    });
    expect(dispatched!.changes.insert).toBe('[[Roadmap]]');
    expect(state.doc.toString()).toBe(doc); // source untouched; view applies it
  });
});
