import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/** `mod` = Cmd on macOS, Ctrl elsewhere. Never hardcode Cmd vs Ctrl (AGENTS.md §5). */
export function isMod(e: KeyboardEvent | ReactKeyboardEvent): boolean {
  if (typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)) return e.metaKey;
  return e.ctrlKey;
}

export function modLabel(): string {
  if (typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)) return '⌘';
  return 'Ctrl';
}

/** True when focus is in an editable field (shortcuts should defer, except mod+key). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
