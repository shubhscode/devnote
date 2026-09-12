import { describe, expect, it } from 'vitest';
import { isColorCode, renderMarkdown } from './index';

describe('renderMarkdown', () => {
  it('renders GFM tables, task lists, strikethrough, footnotes', () => {
    const html = renderMarkdown(
      '| a | b |\n|---|---|\n| 1 | 2 |\n\n- [ ] todo\n- [x] done\n\n~~gone~~\n\nHi[^1]\n\n[^1]: ref',
    );
    expect(html).toContain('<table>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('<del>gone</del>');
    expect(html).toContain('class="footnotes"');
  });

  it('keeps highlight language classes, strips scripts and js: urls', () => {
    const html = renderMarkdown('```js\nconst a = 1;\n```\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))');
    expect(html).toContain('language-js');
    expect(html).toContain('hljs-keyword');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('javascript:');
  });

  it('renders GitHub-style alerts without svg payload', () => {
    const html = renderMarkdown('> [!WARNING]\n> careful');
    expect(html).toContain('markdown-alert-warning');
    expect(html).not.toContain('<svg');
  });

  it('strips frontmatter, keeps sub/sup inline html', () => {
    const html = renderMarkdown('---\ntitle: x\n---\n\nH<sub>2</sub>O and x<sup>2</sup>');
    expect(html).not.toContain('title: x');
    expect(html).toContain('<sub>2</sub>');
    expect(html).toContain('<sup>2</sup>');
  });

  it('marks backticked colors with swatch spans', () => {
    const html = renderMarkdown('The color is `#ff6600` and `rgb(1, 2, 3)` but not `nope`.');
    expect(html).toContain('class="colorcode"');
    expect(html).toContain('class="sw"');
    expect(isColorCode('#ff6600')).toBe(true);
    expect(isColorCode('nope')).toBe(false);
  });
});
