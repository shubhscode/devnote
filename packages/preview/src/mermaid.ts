// Mermaid placeholder (2.12): converts fenced ```mermaid blocks into
// inert `div.mermaid-block[data-mermaid]` nodes BEFORE sanitize. The raw
// source rides the (escaped) attribute; the real SVG render happens in the
// web app via a lazy `mermaid` chunk — never in this package (window-free,
// bundle-diet: ~1MB dep loads only when a block exists).
import { visit } from 'unist-util-visit';
import type { Element, Root as HtmlRoot } from 'hast';

export function mermaidPlaceholder() {
  return (tree: HtmlRoot): void => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'pre') return;
      const code = node.children.find(
        (c): c is Element => c.type === 'element' && c.tagName === 'code',
      );
      if (!code) return;
      const cls = code.properties?.className;
      const list = Array.isArray(cls) ? cls.map(String) : [];
      if (!list.includes('language-mermaid')) return;
      const src = code.children
        .filter((c) => c.type === 'text')
        .map((c) => (c as { value: string }).value)
        .join('');
      // In-place re-tag: no sibling splicing (visit loop-safety rule).
      // Source stays as a TEXT child (fully escaped by stringify) — safer
      // than a data attribute, which HTML leaves unescaped for `<`.
      node.tagName = 'div';
      node.properties = { className: ['mermaid-block'] };
      node.children = [{ type: 'text', value: src }];
    });
  };
}
