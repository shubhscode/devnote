import { useState } from 'react';
import { isTauri } from '../lib/mirror';

function isMac(): boolean {
  if (typeof navigator === 'undefined') return true;
  return /mac/i.test(navigator.platform) || /mac/i.test(navigator.userAgent);
}

async function currentWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

type WinApi = {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
};

function Glyph({ kind }: { kind: 'close' | 'minimize' | 'zoom' }) {
  const common = {
    width: 7,
    height: 7,
    viewBox: '0 0 7 7',
    fill: 'none',
    stroke: 'rgba(0,0,0,0.55)',
    strokeWidth: 1.1,
    strokeLinecap: 'round' as const,
    'aria-hidden': true,
  };
  if (kind === 'close') {
    return (
      <svg {...common}>
        <path d="M1.2 1.2l4.6 4.6M5.8 1.2L1.2 5.8" />
      </svg>
    );
  }
  if (kind === 'minimize') {
    return (
      <svg {...common}>
        <path d="M1.2 3.5h4.6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M3.5 1.2v4.6M1.2 3.5h4.6" />
    </svg>
  );
}

function MacLights({ onAction }: { onAction: (fn: (w: WinApi) => Promise<void>) => void }) {
  const [hover, setHover] = useState(false);
  const light = (color: string, border: string, kind: 'close' | 'minimize' | 'zoom', title: string, run: () => void): React.ReactNode => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        run();
      }}
      className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full p-0 leading-none"
      style={{ backgroundColor: color, border: `0.5px solid ${border}` }}
    >
      <span className={`flex items-center justify-center ${hover ? 'opacity-100' : 'opacity-0'}`}>
        <Glyph kind={kind} />
      </span>
    </button>
  );
  return (
    <span
      className="flex items-center gap-2"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {light('#FF5F57', '#E0443E', 'close', 'Close', () => void onAction((w) => w.close()))}
      {light('#FEBC2E', '#DEA123', 'minimize', 'Minimize', () => void onAction((w) => w.minimize()))}
      {light('#28C840', '#1AAB29', 'zoom', 'Zoom', () => void onAction((w) => w.toggleMaximize()))}
    </span>
  );
}

function WinControls({ onAction }: { onAction: (fn: (w: WinApi) => Promise<void>) => void }) {
  const btn = 'flex h-8 w-11 items-center justify-center text-xs opacity-80 hover:opacity-100';
  return (
    <span className="flex items-center">
      <button title="Minimize" className={`${btn} hover:bg-zinc-200 dark:hover:bg-zinc-800`} onClick={(e) => { e.stopPropagation(); void onAction((w) => w.minimize()); }}>—</button>
      <button title="Maximize" className={`${btn} hover:bg-zinc-200 dark:hover:bg-zinc-800`} onClick={(e) => { e.stopPropagation(); void onAction((w) => w.toggleMaximize()); }}>▢</button>
      <button title="Close" className={`${btn} hover:bg-red-600 hover:text-white`} onClick={(e) => { e.stopPropagation(); void onAction((w) => w.close()); }}>✕</button>
    </span>
  );
}

/**
 * Custom window chrome for the frameless Tauri window (tauri.conf:
 * decorations=false). Hidden in browsers. The row is a drag region;
 * buttons stop propagation so clicks don't drag.
 */
export default function TrafficLights() {
  if (!isTauri()) return null;
  const mac = isMac();

  const act = async (fn: (w: WinApi) => Promise<void>) => {
    try {
      await fn(await currentWindow());
    } catch {
      // Not in Tauri (shouldn't happen — guarded above).
    }
  };

  if (!mac) {
    return (
      <div data-tauri-drag-region className="flex h-10 shrink-0 items-center justify-end">
        <span className="mr-auto px-1 text-[13px] font-semibold">DevNote</span>
        <WinControls onAction={act} />
      </div>
    );
  }

  return (
    <div data-testid="traffic-lights" data-tauri-drag-region className="flex h-10 shrink-0 items-center gap-2.5 px-3">
      <MacLights onAction={act} />
      <span className="select-none text-[13px] font-semibold tracking-tight">DevNote</span>
    </div>
  );
}
