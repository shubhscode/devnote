// Task-list round-trip (2.4): preview checkboxes carry a stable index, and
// toggling splices the source line via mdast positions (byte-preserving —
// unlike remark-stringify, which would reformat the whole note).
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import type { ListItem, Root as MdRoot } from 'mdast';
import type { Element, Root as HtmlRoot, RootContent } from 'hast';

function hasTaskClass(node: Element): boolean {
  const cls = node.properties?.className;
  const list = Array.isArray(cls) ? cls.map(String) : [];
  return list.includes('task-list-item');
}

/**
 * rehype plugin: strip `disabled` (so clicks reach the handler) and stamp
 * `data-task-index` in document order. Index matches setTaskChecked's order.
 * Tracks ancestry (not just the parent) because loose list items nest the
 * checkbox as `li > p > input`.
 */
export function indexTaskCheckboxes() {
  return (tree: HtmlRoot): void => {
    let n = 0;
    const walk = (node: RootContent | HtmlRoot, inTaskItem: boolean): void => {
      let inside = inTaskItem;
      if (node.type === 'element') {
        if (node.tagName === 'li' && hasTaskClass(node)) inside = true;
        if (node.tagName === 'input' && inside && node.properties?.type === 'checkbox') {
          const props = { ...(node.properties ?? {}) };
          delete props.disabled;
          props.dataTaskIndex = n++;
          node.properties = props;
        }
      }
      const kids: readonly (RootContent)[] =
        node.type === 'element' || node.type === 'root' ? node.children : [];
      for (const child of kids) walk(child, inside);
    };
    walk(tree, false);
  };
}

const TASK_MARKER = /^(\s*(?:[-*+]|\d+[.)])\s+)\[[xX ]\]/;

/** Set the nth task checkbox (document order, 0-based). Out-of-range = no-op. */
export function setTaskChecked(body: string, index: number, checked: boolean): string {
  if (index < 0) return body;
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as MdRoot;
  const items: ListItem[] = [];
  visit(tree, 'listItem', (node: ListItem) => {
    if (node.checked !== null && node.checked !== undefined) items.push(node);
  });
  const target = items[index];
  if (target?.position === undefined) return body;
  const lines = body.split('\n');
  const at = target.position.start.line - 1;
  const line = lines[at];
  if (line === undefined) return body;
  // Anchored to the list marker — a `[a]`-style link later in the line can't match.
  const next = line.replace(TASK_MARKER, `$1[${checked ? 'x' : ' '}]`);
  if (next === line) return body;
  lines[at] = next;
  return lines.join('\n');
}

/** Count task items (document order) — bounds UI toggles. */
export function countTasks(body: string): number {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as MdRoot;
  let n = 0;
  visit(tree, 'listItem', (node: ListItem) => {
    if (node.checked !== null && node.checked !== undefined) n += 1;
  });
  return n;
}
