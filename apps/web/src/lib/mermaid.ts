// Mermaid render pass (2.12): finds div[data-mermaid="1"] placeholders in the
// sanitized preview HTML and swaps in the rendered SVG. The ~1MB mermaid
// chunk loads on first diagram only (bundle-diet guard). mermaid 12 ships
// `mermaid` as a browser-friendly export; render is dynamic-imported so
// notes without diagrams pay nothing.
let loading: Promise<typeof import('mermaid').default> | null = null;

const THEME_VARS = [
  '--bg',
  '--fg',
  '--border',
  '--accent',
  '--bg-raised',
  '--fg-muted',
] as const;

function themeVariables(): Record<string, string> {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string): string => s.getPropertyValue(name).trim();
  return {
    background: v('--bg') || '#ffffff',
    primaryColor: v('--accent-soft') || '#e0f2fe',
    primaryTextColor: v('--fg') || '#18181b',
    primaryBorderColor: v('--accent') || '#0284c7',
    lineColor: v('--fg-muted') || '#71717a',
    secondaryColor: v('--bg-raised') || '#f4f4f5',
    tertiaryColor: v('--bg-raised') || '#f4f4f5',
    mainBkg: v('--bg-raised') || '#f4f4f5',
    textColor: v('--fg') || '#18181b',
  };
}

/** Await the (single) mermaid module instance preconfigured with theme vars. */
export function loadMermaid() {
  loading ??= import('mermaid').then(({ default: mm }) => {
    mm.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      themeVariables: themeVariables(),
    });
    return mm;
  });
  return loading;
}

export { THEME_VARS };
