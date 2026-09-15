import { useEffect, useRef } from 'react';

interface PaneResizerProps {
  label: string;
  /** Current width (captured at drag start). */
  value: number;
  min: number;
  max: number;
  onChange: (width: number) => void;
  onReset: () => void;
  /** Fires true on drag start, false on release/cancel (lets parents skip tweens). */
  onActiveChange?: (active: boolean) => void;
}

/**
 * Draggable pane splitter. Pointer capture keeps the drag alive outside the
 * handle; double-click resets. Widths persist via Settings (updateSettings).
 */
export default function PaneResizer({ label, value, min, max, onChange, onReset, onActiveChange }: PaneResizerProps) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      title={`${label} (drag to resize, double-click to reset)`}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(Math.max(min, value - 8)); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); onChange(Math.min(max, value + 8)); }
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        drag.current = { x: e.clientX, w: value };
        onActiveChange?.(true);
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const next = Math.min(max, Math.max(min, d.w + (e.clientX - d.x)));
        // Coalesce to one store update per frame — settings persist on change.
        cancelAnimationFrame(raf.current);
        raf.current = requestAnimationFrame(() => onChange(next));
      }}
      onPointerUp={() => { drag.current = null; onActiveChange?.(false); }}
      onPointerCancel={() => { drag.current = null; onActiveChange?.(false); }}
      className="focus-ring w-1.5 shrink-0 cursor-col-resize touch-none transition-colors hover:bg-[var(--accent-soft)] focus:bg-[var(--accent-soft)] active:bg-[var(--accent-soft)]"
    />
  );
}
