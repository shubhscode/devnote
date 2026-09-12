// Custom remark/rehype plugins for devnote preview.
import { visit } from 'unist-util-visit';
import type { Root as MdRoot } from 'mdast';
import type { Element, Root as HtmlRoot } from 'hast';

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const RGB = /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/;
const HSL = /^hsl\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*\)$/;

export function isColorCode(value: string): boolean {
  return HEX.test(value) || RGB.test(value) || HSL.test(value);
}

/** Drop YAML/TOML frontmatter nodes (file-mirror compat, Phase 3). */
export function stripFrontmatter() {
  return (tree: MdRoot): void => {
    // 'toml' nodes come from remark-frontmatter but aren't in mdast types.
    tree.children = tree.children.filter(
      (n) => n.type !== 'yaml' && (n.type as string) !== 'toml',
    );
  };
}

function addClass(node: Element, cls: string): void {
  const props = node.properties ?? {};
  const prev = props.className;
  const list = Array.isArray(prev) ? prev.map(String) : prev !== undefined ? [String(prev)] : [];
  if (!list.includes(cls)) list.push(cls);
  node.properties = { ...props, className: list };
}

/**
 * GitHub-style color swatches: `` `#RRGGBB` `` / `` `rgb(..)` `` / `` `hsl(..)` ``
 * get a dot. The span carries no color itself (sanitizer-safe) — the web
 * PreviewView paints it from the sibling code text via DOM.
 */
export function colorSwatch() {
  return (tree: HtmlRoot): void => {
    // Two-pass: collect first, splice after — mutating siblings mid-visit loops forever.
    const hits: { parent: { children: unknown[] }; node: Element }[] = [];
    visit(tree, 'element', (node: Element, _index, parent) => {
      if (node.tagName !== 'code' || parent === undefined) return;
      if (parent.type === 'element' && parent.tagName === 'pre') return; // fenced blocks excluded
      const text = node.children
        .filter((c) => c.type === 'text')
        .map((c) => (c as { value: string }).value)
        .join('');
      if (!isColorCode(text.trim())) return;
      if (parent.type === 'element' || parent.type === 'root') {
        hits.push({ parent: parent as unknown as { children: unknown[] }, node });
      }
    });
    for (const { parent, node } of hits) {
      addClass(node, 'colorcode');
      const dot: Element = {
        type: 'element',
        tagName: 'span',
        properties: { className: ['sw'] },
        children: [],
      };
      const at = parent.children.indexOf(node);
      if (at !== -1) parent.children.splice(at, 0, dot);
    }
  };
}
