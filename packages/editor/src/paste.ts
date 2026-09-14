// Paste handling (2.5): URL-paste wraps the selection as a link;
// rich-HTML paste converts to Markdown. Pure + unit-tested; view.ts wires
// them into a CodeMirror paste handler.
/// <reference path="./vendor.d.ts" />
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import type { Edit } from './text';

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Paste-a-URL over a selection → `[selection](url)`. Null when inapplicable
 * (collapsed cursor, non-URL clipboard, empty selection) so CM pastes plain.
 */
export function pasteUrlEdit(doc: string, from: number, to: number, pasted: string): Edit | null {
  if (from === to) return null;
  if (!isHttpUrl(pasted)) return null;
  const selected = doc.slice(from, to);
  if (selected === '') return null;
  const insert = `[${selected}](${pasted.trim()})`;
  return { from, to, insert, selStart: from, selEnd: from + insert.length };
}

let turndown: TurndownService | null = null;

function converter(): TurndownService {
  if (!turndown) {
    turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
    turndown.use(gfm);
  }
  return turndown;
}

/** Convert rich-HTML clipboard content to Markdown (tables/tasks included). */
export function htmlToMarkdown(html: string): string {
  return normalizeLists(converter().turndown(html));
}

/**
 * Turndown pads markers (`-   one`, `-   [x]  done`); collapse to house
 * style. Scoped to list-item starts so hard-break double spaces survive.
 */
export function normalizeLists(md: string): string {
  return md
    .split('\n')
    .map((line) => line
      .replace(/^(\s*)[-*]   /, '$1- ')
      .replace(/^(\s*- \[[ xX]\])  +/, '$1 '))
    .join('\n');
}
