// Single-note HTML export (2.7): standalone sanitized document with the
// active theme's CSS variables inlined. No network, no external assets.
import { renderMarkdown } from './index';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface ExportTheme {
  /** CSS vars (`--bg`, `--fg`, …) inlined on :root. */
  variables?: Record<string, string>;
}

/** Render a note as a self-contained HTML document (reimportable MD stays in core). */
export function exportHtmlDoc(title: string, markdown: string, theme: ExportTheme = {}): string {
  const body = renderMarkdown(markdown);
  const vars = Object.entries(theme.variables ?? {})
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  const safeTitle = escapeHtml(title === '' ? 'Untitled' : title);
  // `body` is sanitizer output — safe to interpolate.
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>
:root {
${vars}
}
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.6; max-width: 760px; margin: 2rem auto; padding: 0 1rem; background: var(--bg, #fff); color: var(--fg, #111); }
pre { background: var(--code-bg, #f4f4f5); padding: 0.75rem; border-radius: 6px; overflow-x: auto; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid var(--border, #ddd); padding: 0.4rem 0.6rem; }
blockquote { border-left: 3px solid var(--accent, #888); margin-left: 0; padding-left: 1rem; opacity: 0.9; }
@media print { body { max-width: none; margin: 0; } }
</style>
</head>
<body>
<h1>${safeTitle}</h1>
${body}
</body>
</html>
`;
}
