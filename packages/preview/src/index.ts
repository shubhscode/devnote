// @devnote/preview — Markdown → sanitized HTML. remark AST in, safe HTML out.
// Never bypass the sanitizer (AGENTS.md §5).
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkAlert from 'remark-github-blockquote-alert';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import { previewSchema } from './schema';
import { colorSwatch, indexHeadings, isColorCode, stripFrontmatter } from './plugins';
import { indexTaskCheckboxes } from './tasks';
import { renderWikilinks } from './links';
import { mermaidPlaceholder } from './mermaid';
import { excalidrawPlaceholder } from './excalidraw';

export { isColorCode, previewSchema };
export { indexHeadings } from './plugins';
export { countTasks, indexTaskCheckboxes, setTaskChecked } from './tasks';
export { renderWikilinks, splitWikilinkText } from './links';
export { exportHtmlDoc } from './export';
export { mermaidPlaceholder } from './mermaid';
export { excalidrawPlaceholder } from './excalidraw';
export type { ExportTheme } from './export';

/**
 * Pipeline factory. `linkTargets` varies per render (note titles change),
 * so a linking processor is built per call — plugin registration is
 * trivial next to parse cost. The shared plain processor covers the rest.
 */
function buildProcessor(
  linkTargets?: Set<string>,
  mermaid = false,
  excalidraw = false,
) {
  const p = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml', 'toml'])
    .use(stripFrontmatter)
    .use(remarkGfm)
    .use(remarkAlert)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw);
  // Before sanitize: added anchors carry only allowlisted attrs.
  // NB: wrap the transformer — passing it directly would run it as an
  // attacher (tree = processor options → crash).
  if (linkTargets !== undefined) {
    const targets = linkTargets;
    p.use(() => renderWikilinks(targets));
  }
  if (mermaid) p.use(() => mermaidPlaceholder());
  if (excalidraw) p.use(() => excalidrawPlaceholder());
  p.use(indexTaskCheckboxes)
    .use(indexHeadings)
    .use(colorSwatch)
    .use(rehypeHighlight, { detect: true })
    .use(rehypeSlug)
    .use(rehypeSanitize, previewSchema)
    .use(rehypeStringify);
  return p;
}

const plainProcessor = buildProcessor();

export interface RenderOptions {
  /** Lowercased existing note titles — unknown targets render broken. */
  linkTargets?: Set<string>;
  /** Convert ```mermaid fences to renderable placeholder divs (2.12). */
  mermaid?: boolean;
  /** Convert ```excalidraw fences to renderable placeholder divs (2.14). */
  excalidraw?: boolean;
}

/** Render Markdown to sanitized HTML. Synchronous; safe to inject. */
export function renderMarkdown(markdown: string, opts?: RenderOptions): string {
  if (
    opts?.linkTargets === undefined &&
    !opts?.mermaid &&
    !opts?.excalidraw
  ) {
    return String(plainProcessor.processSync(markdown));
  }
  return String(
    buildProcessor(opts.linkTargets, opts.mermaid, opts.excalidraw).processSync(
      markdown,
    ),
  );
}
