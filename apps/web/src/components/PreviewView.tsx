import { useEffect, useMemo, useRef } from 'react';
import { isColorCode, renderMarkdown } from '@devnote/preview';
// NOTE: no highlight.js stylesheet import — token colors come from our own
// theme-variable rules in index.css (pastel on dark, saturated on light).

interface Props {
  markdown: string;
}

/**
 * Rendered Markdown preview. HTML is sanitized in @devnote/preview
 * (rehype-sanitize) before injection — never inject unsanitized HTML.
 * Enhancements (copy buttons, color swatches) are applied via DOM post-pass.
 */
export default function PreviewView(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderMarkdown(props.markdown), [props.markdown]);

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

  // Sanitized by @devnote/preview — safe to inject (AGENTS.md §5).
  return <div ref={hostRef} className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />;
}
