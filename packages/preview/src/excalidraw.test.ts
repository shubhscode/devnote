import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './index';

const DOC = '# T\n\n```excalidraw\n{"elements":[]}\n```\n';

describe('excalidrawPlaceholder', () => {
  it('converts excalidraw fence to placeholder div when enabled', () => {
    const html = renderMarkdown(DOC, { excalidraw: true });
    expect(html).toContain('div class="excalidraw-block"');
    expect(html).toContain('{"elements":[]}');
    expect(html).not.toContain('<code');
  });

  it('keeps the code block when disabled', () => {
    const html = renderMarkdown(DOC);
    expect(html).toContain('language-excalidraw');
    expect(html).not.toContain('excalidraw-block');
  });

  it('sanitized output carries no real elements from the JSON', () => {
    const html = renderMarkdown(
      '```excalidraw\n{"elements":[],"x":"<img src=x onerror=alert(1)>"}\n```\n',
      { excalidraw: true },
    );
    expect(html).not.toMatch(/<img[\s>]/);
    expect(html).toContain('&#x3C;img');
  });

  it('leaves mermaid/other fences untouched', () => {
    const html = renderMarkdown('```excalidrawx\nhi\n```', { excalidraw: true });
    expect(html).toContain('language-excalidrawx');
  });
});
