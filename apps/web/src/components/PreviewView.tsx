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
  const renderDiagrams = useDevnote((s) => s.settings.renderDiagrams);
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
    () => renderMarkdown(props.markdown, { linkTargets, mermaid: renderDiagrams, excalidraw: renderDiagrams }),
    [props.markdown, linkTargets, renderDiagrams],
  );

  // Mermaid (2.12): placeholders → SVG via the lazy mermaid chunk. Source is
  // the div's (escaped) text child; mermaid's strict securityLevel guards
  // the SVG output. Errors degrade to the raw source (still legible).
  useEffect(() => {
    const root = hostRef.current;
    if (!root) return;
    const blocks = Array.from(
      root.querySelectorAll<HTMLElement>('div.mermaid-block:not([data-rendered])'),
    );
    if (blocks.length === 0) return;
    let cancelled = false;
    void (async () => {
      const { loadMermaid } = await import('../lib/mermaid');
      const mm = await loadMermaid();
      for (const [i, el] of blocks.entries()) {
        if (cancelled) return;
        const src = el.textContent ?? '';
        el.setAttribute('aria-busy', 'true');
        try {
          const { svg } = await mm.render(`mmd-${Date.now()}-${i}`, src);
          if (cancelled) return;
          el.innerHTML = svg;
          el.classList.remove('mermaid-error');
        } catch {
          el.classList.add('mermaid-error');
        }
        el.removeAttribute('aria-busy');
        el.dataset.rendered = '1';
      }
    })();
    return () => { cancelled = true; };
  }, [html]);

  // Excalidraw (2.14): JSON fences → SVG via the lazy excalidraw chunk.
  // Source is the div's escaped text child; exportToSvg output is
  // pre-sanitized. Errors degrade to the raw JSON (still legible).
  useEffect(() => {
    const root = hostRef.current;
    if (!root) return;
    const blocks = Array.from(
      root.querySelectorAll<HTMLElement>('div.excalidraw-block:not([data-rendered])'),
    );
    if (blocks.length === 0) return;
    let cancelled = false;
    void (async () => {
      const { renderExcalidraw } = await import('../lib/excalidraw');
      for (const el of blocks) {
        if (cancelled) return;
        const src = el.textContent ?? '';
        el.setAttribute('aria-busy', 'true');
        try {
          const svgHtml = await renderExcalidraw(src);
          if (cancelled) return;
          el.innerHTML = svgHtml;
          el.classList.remove('excalidraw-err');
        } catch {
          el.classList.add('excalidraw-err');
        }
        el.removeAttribute('aria-busy');
        el.dataset.rendered = '1';
      }
    })();
    return () => { cancelled = true; };
  }, [html]);

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
      btn.setAttribute('aria-label', 'Copy code block');
      btn.setAttribute('title', 'Copy code block');
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

  // Attachments: resolve `.attachments/…` refs to blob URLs from desktop
  // bytes (sanitizer keeps the relative src; blob is set post-sanitize).
  // Cached per src so keystrokes don't re-read disk; revoked on unmount.
  const blobCache = useRef(new Map<string, string>());
  useEffect(() => {
    const root = hostRef.current;
    if (!root) return;
    let cancelled = false;
    void (async () => {
      const { isAttachmentRef, attachmentExt } = await import('@devnote/core');
      const { loadAttachmentBytes } = await import('../lib/attachments');
      for (const img of root.querySelectorAll('img')) {
        const src = img.getAttribute('src') ?? '';
        if (!isAttachmentRef(src) || img.dataset.resolved === '1') continue;
        try {
          let url = blobCache.current.get(src);
          if (!url) {
            const bytes = await loadAttachmentBytes(src);
            if (cancelled) return;
            const ext = attachmentExt(src);
            url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` }));
            blobCache.current.set(src, url);
          }
          img.src = url;
          img.dataset.resolved = '1';
        } catch { /* desktop-only bytes — alt text stays as the fallback */ }
      }
    })();
    return () => { cancelled = true; };
  }, [html]);
  useEffect(() => {
    const cache = blobCache.current;
    return () => {
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    };
  }, []);

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
