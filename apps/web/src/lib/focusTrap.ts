import { useEffect } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function visibleItems(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
}

/**
 * Modal focus trap for dialog panels. Cycles Tab inside, restores focus to
 * the previously focused element on unmount. Respects an existing autofocus:
 * if focus is already inside on mount, nothing is stolen. Pair with
 * `role="dialog"` + `aria-modal="true"` on the panel.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, onClose?: () => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = visibleItems(el);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener('keydown', onKey);
    if (!el.contains(document.activeElement)) {
      const items = visibleItems(el);
      if (items[0]) items[0].focus();
      else {
        el.setAttribute('tabindex', '-1');
        el.focus({ preventScroll: true });
      }
    }
    return () => {
      el.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [ref, onClose]);
}
