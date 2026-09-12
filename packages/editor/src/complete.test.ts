import { describe, expect, it } from 'vitest';
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import {
  codeCompleter,
  collectWords,
  fenceInfoPrefix,
  fenceLanguages,
  languageOptions,
} from './complete';

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

describe('fenceLanguages', () => {
  it('covers common languages with aliases, sorted + deduped', () => {
    const langs = fenceLanguages();
    const names = langs.map((l) => l.name);
    expect(names).toContain('python');
    expect(names).toContain('typescript');
    expect(names).toContain('c++');
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('fenceInfoPrefix', () => {
  it('detects the info string after ```', () => {
    const doc = '```py';
    expect(fenceInfoPrefix(stateWith(doc), doc.length)).toMatchObject({ query: 'py' });
    expect(fenceInfoPrefix(stateWith('```'), 3)).toMatchObject({ query: '' });
  });

  it('rejects non-fence lines and closed fences', () => {
    expect(fenceInfoPrefix(stateWith('hello'), 5)).toBeNull();
    expect(fenceInfoPrefix(stateWith('```js rest'), 9)).toBeNull();
  });
});

describe('languageOptions', () => {
  it('prefix-filters names and aliases', () => {
    const labels = languageOptions('py').map((o) => o.label);
    expect(labels).toContain('python');
    expect(languageOptions('zzz')).toHaveLength(0);
  });
});

describe('collectWords', () => {
  it('dedupes 3+ char words', () => {
    expect(collectWords('const total = total + subTotal;')).toEqual(['const', 'total', 'subTotal']);
    expect(collectWords('a bb cc')).toEqual([]);
  });
});

describe('codeCompleter', () => {
  it('suggests languages on the fence info line', () => {
    const res = codeCompleter(ctxFor('```py'));
    expect(res).not.toBeNull();
    expect(res?.options.map((o) => o.label)).toContain('python');
  });

  it('suggests document words inside fenced code', () => {
    const doc = '```js\nconst totalOrder = 1;\ntot';
    const res = codeCompleter(ctxFor(doc));
    expect(res?.options.map((o) => o.label)).toContain('totalOrder');
  });

  it('stays quiet in prose unless invoked explicitly', () => {
    expect(codeCompleter(ctxFor('hello wor'))).toBeNull();
    const res = codeCompleter(ctxFor('hello hel', undefined, true));
    expect(res?.options.map((o) => o.label)).toContain('hello');
  });

  it('returns null when nothing matches', () => {
    expect(codeCompleter(ctxFor('```zzz'))).toBeNull();
  });
});
