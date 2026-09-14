import { useEffect, useState } from 'react';
import {
  AlertTriangle, Bold, Code, CodeSquare, Italic, Link,
  ListCheck, OrderedList, QuoteUp, UnorderedList,
} from 'reicon-react';
import type { MutableRefObject, ReactNode } from 'react';
import {
  insertMarkdownLink, isAlertBlock, isFencedBlock, isLinePrefixed,
  isNumberedLines, isTaskLines, isWrapped, toggleAlert, toggleBold,
  toggleBullet, toggleCode, toggleFence, toggleItalic, toggleNumbered,
  toggleQuote, toggleCheckTask, type AlertKind, type EditorView,
} from '@devnote/editor';
import RowMenu from './RowMenu';

interface Props {
  viewRef: MutableRefObject<EditorView | null>;
  /** False in preview-only mode or for trashed notes. */
  active: boolean;
  onAction: (fn: (view: EditorView) => boolean) => void;
}

interface ButtonSpec {
  title: string;
  icon: ReactNode;
  active: boolean;
  run: (view: EditorView) => boolean;
  separatorBefore?: boolean;
}

const BTN = 'rounded p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700';
const BTN_ACTIVE = 'rounded bg-sky-200 p-1.5 dark:bg-sky-800';
const MENU_WIDTH = 280;
const ALERT_KIND: AlertKind = 'NOTE';

/**
 * Floating formatting menu (editorcn-style UX on CodeMirror).
 * Shows above a non-empty text selection; positioned from the
 * selection coords and refreshed on selection/scroll/resize/focus.
 */
export default function EditorBubbleMenu({ viewRef, active, onAction }: Props) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const onScroll = () => bump();
    window.addEventListener('resize', bump);
    document.addEventListener('scroll', onScroll, true);
    const view = viewRef.current;
    view?.dom.addEventListener('focus', bump);
    view?.dom.addEventListener('blur', bump);
    return () => {
      window.removeEventListener('resize', bump);
      document.removeEventListener('scroll', onScroll, true);
      view?.dom.removeEventListener('focus', bump);
      view?.dom.removeEventListener('blur', bump);
    };
    // Rebind when the mounted view identity changes (note switches reuse one view).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRef.current]);

  const view = viewRef.current;
  if (!active || !view) return null;
  const sel = view.state.selection.main;
  if (sel.empty || !view.hasFocus) return null;

  const doc = view.state.doc.toString();
  const coords = view.coordsAtPos(sel.from);
  const endCoords = view.coordsAtPos(sel.to);
  if (!coords || !endCoords) return null;
  const left = Math.max(8, Math.min(window.innerWidth - MENU_WIDTH - 8, Math.min(coords.left, endCoords.left)));
  let top = Math.min(coords.top, endCoords.top) - 48;
  if (top < 8) top = Math.max(coords.bottom, endCoords.bottom) + 10;

  const buttons: ButtonSpec[] = [
    { title: 'Bold (mod+B)', icon: <Bold size={15} />, active: isWrapped(doc, sel.from, sel.to, '**'), run: toggleBold },
    { title: 'Italic (mod+I)', icon: <Italic size={15} />, active: isWrapped(doc, sel.from, sel.to, '*') && !isWrapped(doc, sel.from, sel.to, '**'), run: toggleItalic },
    { title: 'Code', icon: <Code size={15} />, active: isWrapped(doc, sel.from, sel.to, '`'), run: toggleCode },
    { title: 'Link (mod+Shift+K)', icon: <Link size={15} />, active: false, run: insertMarkdownLink },
    { title: 'Task', icon: <ListCheck size={15} />, active: isTaskLines(doc, sel.from, sel.to), run: toggleCheckTask },
  ];
  const overflow: ButtonSpec[] = [
    { title: 'Code block', icon: <CodeSquare size={15} />, active: isFencedBlock(doc, sel.from, sel.to), run: toggleFence },
    { title: 'Bullet list', icon: <UnorderedList size={15} />, active: isLinePrefixed(doc, sel.from, sel.to, '- '), run: toggleBullet },
    { title: 'Numbered list', icon: <OrderedList size={15} />, active: isNumberedLines(doc, sel.from, sel.to), run: toggleNumbered },
    { title: 'Quote', icon: <QuoteUp size={15} />, active: isLinePrefixed(doc, sel.from, sel.to, '> '), run: toggleQuote },
    { title: 'GitHub Alert (NOTE)', icon: <AlertTriangle size={15} />, active: isAlertBlock(doc, sel.from, sel.to), run: (view) => toggleAlert(view, ALERT_KIND) },
  ];
  const click = (run: (view: EditorView) => boolean) => onAction(run);

  return (
    <div
      data-testid="bubble-menu"
      className="group fixed z-40 flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-1 shadow-xl"
      style={{ left, top }}
    >
      {buttons.map((b) => (
        <div key={b.title} className="flex items-center">
          {b.separatorBefore && <span className="mx-1 h-4 w-px bg-[var(--border)]" />}
          <button
            type="button"
            title={b.title}
            aria-label={b.title}
            // Keep the editor selection (editorcn pattern): no focus steal.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => click(b.run)}
            className={b.active ? BTN_ACTIVE : BTN}
          >
            {b.icon}
          </button>
        </div>
      ))}
      <span className="mx-1 h-4 w-px bg-[var(--border)]" />
      <RowMenu
        label="More formatting"
        align="right"
        items={overflow.map((b) => ({
          title: b.title,
          icon: b.icon,
          onSelect: () => click(b.run),
        }))}
      />
    </div>
  );
}
