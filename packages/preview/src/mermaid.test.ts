// 2.12: ```mermaid fences → inert placeholder divs (sanitize-safe).
// Actual SVG rendering lives in the web app (lazy mermaid chunk).
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './index';

const DIAG = 'flowchart TD\n  A[HLD] --> B{LLD}>';

describe('mermaid placeholder', () => {
  it('converts a fenced block into a data-mermaid div when enabled', () => {
    const html = renderMarkdown('```mermaid\n' + DIAG + '\n```', { mermaid: true });
    expect(html).toContain('mermaid-block');
    expect(html).toContain('flowchart TD');
    expect(html).not.toContain('<code');
  });

  it('keeps the fence as a plain code block when disabled', () => {
    const html = renderMarkdown('```mermaid\n' + DIAG + '\n```');
    expect(html).toContain('language-mermaid');
    expect(html).not.toContain('mermaid-block');
  });

  it('sanitized output: source attr survives, script injection does not', () => {
    const html = renderMarkdown('```mermaid\nflowchart TD\n  A["</script><img src=x onerror=alert(1)>"]\n```', { mermaid: true });
    expect(html).toContain('mermaid-block');
    // Source text is a fully-escaped text child — no real elements.
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&#x3C;img');
  });

  it('other languages are untouched', () => {
    const html = renderMarkdown('```ts\nconst a = 1;\n```', { mermaid: true });
    expect(html).toContain('language-ts');
    expect(html).not.toContain('mermaid-block');
  });
});
