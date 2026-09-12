import { describe, expect, it } from 'vitest';
import {
  BUILTIN_THEMES,
  BUNDLED_THEMES,
  EXTRA_THEMES,
  THEME_VAR_KEYS,
  getTheme,
  isValidThemeId,
  listThemes,
  registerTheme,
  resolveIsDark,
  themeCssVars,
} from './themes';

describe('themes', () => {
  it('ships light/dark/system builtins', () => {
    expect(BUILTIN_THEMES.map((t) => t.id)).toEqual(['light', 'dark', 'system']);
  });

  it('bundles community themes with full variable sets', () => {
    expect(EXTRA_THEMES.map((t) => t.id)).toEqual([
      'catppuccin-latte', 'catppuccin-mocha',
      'solarized-light', 'solarized-dark', 'dracula', 'nord',
    ]);
    for (const t of EXTRA_THEMES) {
      expect(Object.keys(t.variables ?? {}).sort()).toEqual([...THEME_VAR_KEYS].sort());
    }
    expect(BUNDLED_THEMES).toHaveLength(BUILTIN_THEMES.length + EXTRA_THEMES.length);
    expect(resolveIsDark('catppuccin-mocha', false, BUNDLED_THEMES)).toBe(true);
    expect(resolveIsDark('catppuccin-latte', true, BUNDLED_THEMES)).toBe(false);
    expect(resolveIsDark('solarized-dark', false, BUNDLED_THEMES)).toBe(true);
    expect(resolveIsDark('dracula', false, BUNDLED_THEMES)).toBe(true);
    expect(resolveIsDark('nord', false, BUNDLED_THEMES)).toBe(true);
  });

  it('pairs pastel code colors with dark themes, saturated with light', () => {
    const vars = (id: string) => themeCssVars(getTheme(BUNDLED_THEMES, id));
    // Dark themes get light, high-luminance keywords; light themes get deep ones.
    expect(vars('catppuccin-mocha')['--code-keyword']).toBe('#cba6f7');
    expect(vars('catppuccin-latte')['--code-keyword']).toBe('#8839ef');
    expect(vars('dracula')['--code-string']).toBe('#f1fa8c');
    expect(vars('solarized-light')['--code-string']).toBe('#2aa198');
  });

  it('validates kebab-case ids', () => {
    expect(isValidThemeId('dracula')).toBe(true);
    expect(isValidThemeId('solarized-light')).toBe(true);
    expect(isValidThemeId('Bad Name')).toBe(false);
    expect(isValidThemeId('')).toBe(false);
  });

  it('resolves dark mode (unknown falls back to OS)', () => {
    expect(resolveIsDark('light', true)).toBe(false);
    expect(resolveIsDark('dark', false)).toBe(true);
    expect(resolveIsDark('system', true)).toBe(true);
    expect(resolveIsDark('system', false)).toBe(false);
    expect(resolveIsDark('nope', true)).toBe(true);
    expect(resolveIsDark('nope', false)).toBe(false);
  });

  it('resolves custom kinds through the registry', () => {
    const customs = registerTheme([], {
      id: 'everforest', name: 'Everforest', kind: 'dark', hint: 'Plugin',
    });
    const all = listThemes(customs);
    expect(resolveIsDark('everforest', false, all)).toBe(true);
    expect(getTheme(all, 'everforest').name).toBe('Everforest');
  });

  it('rejects bad registrations', () => {
    expect(() => registerTheme([], { id: 'Bad!', name: 'x', kind: 'dark', hint: '' })).toThrow();
    expect(() => registerTheme([], { id: 'x', name: '  ', kind: 'dark', hint: '' })).toThrow();
    expect(() => registerTheme([], { id: 'light', name: 'dup', kind: 'light', hint: '' })).toThrow();
    expect(() =>
      registerTheme([], { id: 'x', name: 'x', kind: 'dark', hint: '', variables: { '--nope': '1' } }),
    ).toThrow();
    expect(() =>
      registerTheme([], { id: 'dracula', name: 'dup', kind: 'dark', hint: '' }),
    ).toThrow();
  });

  it('keeps builtin ids on list collision + falls back on get', () => {
    const all = listThemes([{ id: 'light', name: 'Fake', kind: 'dark', hint: '' }]);
    expect(all.filter((t) => t.id === 'light')).toHaveLength(1);
    expect(getTheme(all, 'missing').id).toBe('system');
  });

  it('exposes css vars for plugin themes only', () => {
    expect(themeCssVars(BUILTIN_THEMES[0]!)).toEqual({});
    expect(
      themeCssVars({ id: 'd', name: 'D', kind: 'dark', hint: '', variables: { '--bg': '#000' } }),
    ).toEqual({ '--bg': '#000' });
  });
});
