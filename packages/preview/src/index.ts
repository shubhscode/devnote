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

export { isColorCode, previewSchema };
export { indexHeadings } from './plugins';
export { countTasks, indexTaskCheckboxes, setTaskChecked } from './tasks';
export { exportHtmlDoc } from './export';
export type { ExportTheme } from './export';

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml', 'toml'])
  .use(stripFrontmatter)
  .use(remarkGfm)
  .use(remarkAlert)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(indexTaskCheckboxes)
  .use(indexHeadings)
  .use(colorSwatch)
  .use(rehypeHighlight, { detect: true })
  .use(rehypeSlug)
  .use(rehypeSanitize, previewSchema)
  .use(rehypeStringify);

/** Render Markdown to sanitized HTML. Synchronous; safe to inject. */
export function renderMarkdown(markdown: string): string {
  return String(processor.processSync(markdown));
}
