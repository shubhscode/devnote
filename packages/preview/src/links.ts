// Wikilink rendering (2.2): `[[target]]` / `[[target|alias]]` text becomes
// an internal anchor. Operates on hast TEXT nodes (post-parse span split —
// the Markdown structure is already fixed, so this is not regex-parsing
// Markdown). Skips code/pre (inline code never links, matching core).
import type { Element, Root as HtmlRoot, RootContent, Text } from 'hast';

const LINK_RE = /\[\[([^\[\]]+?)\]\]/g;
// NOTE: never .test() with LINK_RE — the /g flag carries lastIndex state.
const LINK_PROBE = /\[\[[^\[\]]+?\]\]/;

interface SplitPart {
  text: string;
  target: string | null;
}

/** Split one text value on `[[..]]` spans (alias after `|`). */
export function splitWikilinkText(value: string): SplitPart[] {
  const parts: SplitPart[] = [];
  let at = 0;
  for (const m of value.matchAll(LINK_RE)) {
    const full = m[0] as string;
    if ((m.index ?? 0) > at) parts.push({ text: value.slice(at, m.index), target: null });
    const inner = (m[1] ?? '') as string;
    const pipe = inner.indexOf('|');
    const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
    const alias = pipe === -1 ? null : inner.slice(pipe + 1).trim();
    if (target === '') {
      parts.push({ text: full, target: null });
    } else {
      parts.push({ text: alias === null || alias === '' ? target : alias, target });
    }
    at = (m.index ?? 0) + full.length;
  }
  if (at < value.length) parts.push({ text: value.slice(at), target: null });
  return parts;
}

/**
 * rehype plugin: rewrite `[[..]]` text as anchors. `targets` holds
 * lowercased existing titles — anything else renders with data-broken.
 */
export function renderWikilinks(targets: Set<string>) {
  return (tree: HtmlRoot): void => {
    const walk = (node: Element | HtmlRoot, inCode: boolean): void => {
      const kids = node.children;
      for (let i = 0; i < kids.length; i++) {
        const child = kids[i] as RootContent;
        if (child.type === 'text') {
          if (!inCode && LINK_PROBE.test(child.value)) {
            const repl: (Text | Element)[] = [];
            for (const part of splitWikilinkText(child.value)) {
              if (part.target === null) {
                repl.push({ type: 'text', value: part.text });
              } else {
                const broken = !targets.has(part.target.trim().toLowerCase());
                repl.push({
                  type: 'element',
                  tagName: 'a',
                  properties: {
                    className: ['wikilink'],
                    dataWikilink: part.target,
                    ...(broken ? { dataBroken: 'true' } : {}),
                  },
                  children: [{ type: 'text', value: part.text }],
                });
              }
            }
            kids.splice(i, 1, ...repl);
            i += repl.length - 1;
          }
        } else if (child.type === 'element') {
          walk(child, inCode || child.tagName === 'code' || child.tagName === 'pre');
        }
      }
    };
    walk(tree, false);
  };
}
