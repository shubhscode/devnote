// Excalidraw placeholder (2.14): converts fenced ```excalidraw blocks into
// inert `div.excalidraw-block` nodes BEFORE sanitize. The JSON source rides
// a TEXT child (fully escaped by stringify). The real SVG render happens in
// the web app via a lazy `excalidraw` chunk — never in this package
// (window-free, bundle-diet: heavy dep loads only when a block exists).
import { visit } from 'unist-util-visit';
import type { Element, Root as HtmlRoot } from 'hast';

export function excalidrawPlaceholder() {
  return (tree: HtmlRoot): void => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'pre') return;
      const code = node.children.find(
        (c): c is Element => c.type === 'element' && c.tagName === 'code',
      );
      if (!code) return;
      const cls = code.properties?.className;
      const list = Array.isArray(cls) ? cls.map(String) : [];
      if (!list.includes('language-excalidraw')) return;
      const src = code.children
        .filter((c) => c.type === 'text')
        .map((c) => (c as { value: string }).value)
        .join('');
      // In-place re-tag: no sibling splicing (visit loop-safety rule).
      node.tagName = 'div';
      node.properties = { className: ['excalidraw-block'] };
      node.children = [{ type: 'text', value: src }];
    });
  };
}
