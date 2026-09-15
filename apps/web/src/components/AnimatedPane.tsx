import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

/** Pane open/close tween. Mirrors --motion-mid (200ms) + --motion-ease-out. */
const DURATION = 0.2;
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface AnimatedPaneProps {
  /** False starts the width-0 exit (element unmounts when done). */
  open: boolean;
  /** Target width in px (pane + its resizer handle). */
  width: number;
  /** True while the pane is being drag-resized — width applies instantly. */
  instant?: boolean;
  children: ReactNode;
}

/**
 * Width-collapse wrapper for layout panes (sidebar, note list).
 * Content keeps its own width so the clip reveals it — nothing reflows
 * mid-animation. Always mounted: only `open` flips, so exit can play.
 */
export default function AnimatedPane(props: AnimatedPaneProps) {
  const reduced = useReducedMotion();
  const duration = reduced || props.instant ? 0 : DURATION;
  return (
    <AnimatePresence initial={false}>
      {props.open && (
        <motion.div
          key="pane"
          initial={{ width: 0 }}
          animate={{ width: props.width }}
          exit={{ width: 0 }}
          transition={{ duration, ease: EASE }}
          className="flex h-full shrink-0 overflow-hidden"
        >
          {props.children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
