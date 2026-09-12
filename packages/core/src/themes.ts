// @devnote/core — theme registry (Phase 4 foundation).
// Pure TS: no react, no fs, no window. Themes are data: an id + light/dark
// kind + CSS-variable overrides. The web app applies `variables` as inline
// styles under `data-theme="<id>"`, so plugin themes need no bundled CSS.

export type ThemeKind = 'light' | 'dark' | 'system';

export interface ThemeDefinition {
  /** Unique kebab-case id, e.g. `dracula`. */
  id: string;
  /** Display name in Telescope `h` + Preferences. */
  name: string;
  /** `system` follows the OS; otherwise forces light/dark. */
  kind: ThemeKind;
  /** Short hint shown under the name. */
  hint: string;
  /** Optional CSS-variable overrides applied under `[data-theme="<id>"]`. */
  variables?: Record<string, string>;
}

export const BUILTIN_THEMES: ThemeDefinition[] = [
  { id: 'light', name: 'Light', kind: 'light', hint: 'Always light' },
  { id: 'dark', name: 'Dark', kind: 'dark', hint: 'Always dark' },
  { id: 'system', name: 'System', kind: 'system', hint: 'Follow the OS' },
];

/** Community favorites shipped as data (accurate upstream palettes). */
export const EXTRA_THEMES: ThemeDefinition[] = [
  {
    id: 'catppuccin-latte', name: 'Catppuccin Latte', kind: 'light', hint: 'Soothing pastel light',
    variables: {
      '--bg': '#eff1f5', '--bg-sidebar': '#e6e9ef', '--bg-list': '#eff1f5',
      '--bg-raised': '#e6e9ef', '--bg-sunken': '#dce0e8',
      '--border': '#ccd0da', '--border-soft': '#dce0e8', '--fg': '#4c4f69',
      '--accent': '#8839ef', '--accent-fg': '#ffffff', '--accent-soft': '#e2d5f5',
      '--code-bg': '#e6e9ef', '--code-fg': '#4c4f69', '--code-keyword': '#8839ef',
      '--code-string': '#40a02b', '--code-comment': '#9ca0b0', '--code-number': '#fe6409',
      '--code-title': '#1e66f5', '--code-builtin': '#04a5e5',
    },
  },
  {
    id: 'catppuccin-mocha', name: 'Catppuccin Mocha', kind: 'dark', hint: 'Soothing pastel dark',
    variables: {
      '--bg': '#1e1e2e', '--bg-sidebar': '#181825', '--bg-list': '#1e1e2e',
      '--bg-raised': '#181825', '--bg-sunken': '#11111b',
      '--border': '#313244', '--border-soft': '#262738', '--fg': '#cdd6f4',
      '--accent': '#cba6f7', '--accent-fg': '#11111b', '--accent-soft': '#38334f',
      '--code-bg': '#11111b', '--code-fg': '#cdd6f4', '--code-keyword': '#cba6f7',
      '--code-string': '#a6e3a1', '--code-comment': '#6c7086', '--code-number': '#fab387',
      '--code-title': '#89b4fa', '--code-builtin': '#89dceb',
    },
  },
  {
    id: 'solarized-light', name: 'Solarized Light', kind: 'light', hint: 'Ethan Schoonover classic',
    variables: {
      '--bg': '#fdf6e3', '--bg-sidebar': '#eee8d5', '--bg-list': '#fdf6e3',
      '--bg-raised': '#eee8d5', '--bg-sunken': '#eee8d5',
      '--border': '#ddd6c1', '--border-soft': '#eee8d5', '--fg': '#657b83',
      '--accent': '#268bd2', '--accent-fg': '#fdf6e3', '--accent-soft': '#dfe9ef',
      '--code-bg': '#eee8d5', '--code-fg': '#657b83', '--code-keyword': '#268bd2',
      '--code-string': '#2aa198', '--code-comment': '#93a1a1', '--code-number': '#d33682',
      '--code-title': '#b58900', '--code-builtin': '#cb4b16',
    },
  },
  {
    id: 'solarized-dark', name: 'Solarized Dark', kind: 'dark', hint: 'Ethan Schoonover classic',
    variables: {
      '--bg': '#002b36', '--bg-sidebar': '#073642', '--bg-list': '#002b36',
      '--bg-raised': '#073642', '--bg-sunken': '#073642',
      '--border': '#14424e', '--border-soft': '#0b3a45', '--fg': '#839496',
      '--accent': '#268bd2', '--accent-fg': '#fdf6e3', '--accent-soft': '#0e3d4a',
      '--code-bg': '#073642', '--code-fg': '#839496', '--code-keyword': '#268bd2',
      '--code-string': '#2aa198', '--code-comment': '#586e75', '--code-number': '#d33682',
      '--code-title': '#b58900', '--code-builtin': '#cb4b16',
    },
  },
  {
    id: 'dracula', name: 'Dracula', kind: 'dark', hint: 'Dark vampire favorite',
    variables: {
      '--bg': '#282a36', '--bg-sidebar': '#21222c', '--bg-list': '#282a36',
      '--bg-raised': '#21222c', '--bg-sunken': '#1e1f29',
      '--border': '#44475a', '--border-soft': '#343642', '--fg': '#f8f8f2',
      '--accent': '#bd93f9', '--accent-fg': '#282a36', '--accent-soft': '#3d3a5c',
      '--code-bg': '#21222c', '--code-fg': '#f8f8f2', '--code-keyword': '#ff79c6',
      '--code-string': '#f1fa8c', '--code-comment': '#6272a4', '--code-number': '#bd93f9',
      '--code-title': '#50fa7b', '--code-builtin': '#8be9fd',
    },
  },
  {
    id: 'nord', name: 'Nord', kind: 'dark', hint: 'Arctic, north-bluish',
    variables: {
      '--bg': '#2e3440', '--bg-sidebar': '#242a36', '--bg-list': '#2e3440',
      '--bg-raised': '#3b4252', '--bg-sunken': '#242a36',
      '--border': '#4c566a', '--border-soft': '#3b4252', '--fg': '#eceff4',
      '--accent': '#8fb6c0', '--accent-fg': '#2e3440', '--accent-soft': '#3a4757',
      '--code-bg': '#242a36', '--code-fg': '#eceff4', '--code-keyword': '#899eb8',
      '--code-string': '#a8b19e', '--code-comment': '#686e7f', '--code-number': '#b69bb1',
      '--code-title': '#8fb6c0', '--code-builtin': '#94b4b3',
    },
  },
];

/** Every theme the app knows about without plugins. */
export const BUNDLED_THEMES: ThemeDefinition[] = [...BUILTIN_THEMES, ...EXTRA_THEMES];

/** CSS variables a theme may override (applied + cleared by the web app). */
export const THEME_VAR_KEYS = [
  '--bg', '--bg-sidebar', '--bg-list', '--bg-raised', '--bg-sunken',
  '--border', '--border-soft', '--fg', '--accent', '--accent-fg', '--accent-soft',
  '--code-bg', '--code-fg', '--code-keyword', '--code-string',
  '--code-comment', '--code-number', '--code-title', '--code-builtin',
] as const;

const THEME_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidThemeId(id: string): boolean {
  return THEME_ID_RE.test(id);
}

function assertValidTheme(def: ThemeDefinition): void {
  if (!isValidThemeId(def.id)) throw new Error(`Invalid theme id "${def.id}" (use kebab-case)`);
  if (def.name.trim() === '') throw new Error('Theme name must not be empty');
  if (def.kind !== 'light' && def.kind !== 'dark' && def.kind !== 'system') {
    throw new Error(`Invalid theme kind "${def.kind}"`);
  }
  if (def.variables) {
    const known = new Set<string>(THEME_VAR_KEYS);
    for (const key of Object.keys(def.variables)) {
      if (!key.startsWith('--')) throw new Error(`Invalid CSS variable "${key}" (must start with --)`);
      if (!known.has(key)) throw new Error(`Unknown theme variable "${key}"`);
    }
  }
}

/** Full list: bundled first, then customs (bundled ids win on collision). */
export function listThemes(customs: ThemeDefinition[] = []): ThemeDefinition[] {
  const seen = new Set(BUNDLED_THEMES.map((t) => t.id));
  const out = [...BUNDLED_THEMES];
  for (const c of customs) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

export function getTheme(
  all: ThemeDefinition[],
  id: string,
): ThemeDefinition {
  return all.find((t) => t.id === id) ?? BUILTIN_THEMES[2]!;
}

/** Register a plugin theme (pure — persistence lives in apps/web). */
export function registerTheme(
  customs: ThemeDefinition[],
  def: ThemeDefinition,
): ThemeDefinition[] {
  assertValidTheme(def);
  if (BUNDLED_THEMES.some((t) => t.id === def.id) || customs.some((t) => t.id === def.id)) {
    throw new Error(`Theme "${def.id}" already exists`);
  }
  return [...customs, def];
}

/** Resolve dark mode for Tailwind's `dark` class. Unknown ids fall back to the OS. */
export function resolveIsDark(
  themeId: string,
  systemDark: boolean,
  all: ThemeDefinition[] = BUNDLED_THEMES,
): boolean {
  const found = all.find((t) => t.id === themeId);
  if (!found) return systemDark;
  if (found.kind === 'dark') return true;
  if (found.kind === 'light') return false;
  return systemDark;
}

/** CSS variables to set on `:root[data-theme]` for a theme (empty for builtins). */
export function themeCssVars(theme: ThemeDefinition): Record<string, string> {
  return { ...(theme.variables ?? {}) };
}
