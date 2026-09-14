import { useEffect, useMemo, useRef } from 'react';
import { isColorCode, renderMarkdown } from '@devnote/preview';
import { useDevnote } from '../lib/store';
// NOTE: no highlight.js stylesheet import — token colors come from our own
// theme-variable rules in index.css (pastel on dark, saturated on light).

interface Props {
  markdown: string;
  /** Task checkbox clicked in preview (index = setTaskChecked order). */
  onTaskToggle?: (index: number, checked: boolean) => void;
  /** Preview heading clicked (index = TOC heading order). */
  onHeadingClick?: (index: number) => void;
  /** Wikilink clicked (target title as written). */
  onWikiLink?: (target: string) => void;
}

/**
 * Rendered Markdown preview. HTML is sanitized in @devnote/preview
 * (rehype-sanitize) before injection — never inject unsanitized HTML.
 * Enhancements (copy buttons, color swatches) are applied via DOM post-pass.
 */
export default function PreviewView(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Lowercased live titles — known wikilink targets (broken ones flagged).
  const notes = useDevnote((s) => s.notes);
  const linkTargets = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) {
      if (n.trashed) continue;
      const t = n.title.trim().toLowerCase();
      if (t !== '') set.add(t);
    }
    return set;
  }, [notes]);
  const html = useMemo(
    () => renderMarkdown(props.markdown, { linkTargets }),
    [props.markdown, linkTargets],
  );

  useEffect(() => {
    const root = hostRef.current;
    if (!root) return;

    // Color swatches: paint the placeholder span from the sibling code text.
    for (const dot of root.querySelectorAll('span.sw')) {
      const code = dot.nextElementSibling;
      const value = code?.textContent?.trim() ?? '';
      if (code && code.tagName === 'CODE' && isColorCode(value)) {
        (dot as HTMLElement).style.backgroundColor = value;
        (dot as HTMLElement).title = value;
      } else {
        dot.remove();
      }
    }

    // Copy buttons on fenced code blocks.
    for (const pre of root.querySelectorAll('pre')) {
      if (pre.querySelector('button.copy-btn') !== null) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.addEventListener('click', () => {
        const code = pre.querySelector('code');
        const text = code ? code.innerText : pre.innerText;
        void navigator.clipboard?.writeText(text).then(() => {
          btn.textContent = 'Copied';
          setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
        });
      });
      pre.appendChild(btn);
    }
  }, [html]);

  // Delegated clicks on sanitized output: task checkboxes + heading anchors.
  useEffect(() => {
    const root = hostRef.current;
    if (!root || (!props.onTaskToggle && !props.onHeadingClick && !props.onWikiLink)) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a[data-wikilink]') as HTMLAnchorElement | null;
      if (link && props.onWikiLink) {
        e.preventDefault();
        props.onWikiLink(link.dataset.wikilink ?? '');
        return;
      }
      const box = target.closest('input[data-task-index]') as HTMLInputElement | null;
      if (box && props.onTaskToggle) {
        props.onTaskToggle(Number(box.dataset.taskIndex), box.checked);
        return;
      }
      const heading = target.closest('[data-heading-index]') as HTMLElement | null;
      if (heading && props.onHeadingClick) {
        props.onHeadingClick(Number(heading.dataset.headingIndex));
      }
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [html, props.onTaskToggle, props.onHeadingClick, props.onWikiLink]);

  // Sanitized by @devnote/preview — safe to inject (AGENTS.md §5).
  return <div ref={hostRef} className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />;
}
