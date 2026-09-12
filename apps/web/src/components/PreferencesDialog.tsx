import { useEffect, useState } from 'react';
import { CloseCircle, Edit, Keyboard, Palette, Refresh, Sliders } from 'reicon-react';
import { BUNDLED_THEMES, notebookPath } from '@devnote/core';
import type { Notebook } from '@devnote/core';
import { COMMAND_META } from '../lib/commands';
import { modLabel } from '../lib/keys';
import type { Settings } from '../lib/store';

interface Props {
  settings: Settings;
  notebooks: Notebook[];
  mirrorDir: string | null;
  syncState: string;
  remoteUrl: string | null;
  syncBusy: boolean;
  onUpdate: (patch: Partial<Settings>) => void;
  onExportMirror: () => void;
  onImportMirror: () => void;
  onSyncNow: () => void;
  onSetRemote: (url: string) => void;
  onBackupZip: () => void;
  onRestoreZip: () => void;
  onClose: () => void;
}

type Tab = 'general' | 'appearance' | 'editing' | 'shortcuts';

const TABS: { id: Tab; label: string; icon: React.ReactNode; title: string }[] = [
  { id: 'general', label: 'General', icon: <Sliders size={15} />, title: 'General settings (default notebook, mirror)' },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={15} />, title: 'Themes, dark/light, font size' },
  { id: 'editing', label: 'Editing', icon: <Edit size={15} />, title: 'Word wrap, toolbar, shortcuts' },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={15} />, title: 'Keybindings reference' },
];

const FALLBACK_SWATCH: Record<string, { bg: string; accent: string }> = {
  light: { bg: '#ffffff', accent: '#0284c7' },
  dark: { bg: '#09090b', accent: '#0284c7' },
  system: { bg: 'linear-gradient(135deg, #ffffff 50%, #09090b 50%)', accent: '#0284c7' },
};

export default function PreferencesDialog(props: Props) {
  const [tab, setTab] = useState<Tab>('general');
  const { settings } = props;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [props]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={props.onClose}>
      <div
        className="flex h-[440px] w-[600px] max-w-[92vw] flex-col rounded-lg bg-[var(--bg-raised)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
          <h2 className="text-sm font-semibold">Preferences</h2>
          <button className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={props.onClose} title="Close (Esc)">
            <CloseCircle size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="w-40 shrink-0 border-r border-[var(--border)] p-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                title={t.title}
                className={`flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${tab === t.id ? 'bg-[var(--accent-soft)]' : ''}`}
              >
                <span className="opacity-70">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            {tab === 'general' && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="pref-default-notebook" className="mb-1 block text-sm font-medium">
                    Default notebook
                  </label>
                  <p className="mb-2 text-xs opacity-60">
                    New notes created from All Notes land here.
                  </p>
                  <select
                    id="pref-default-notebook"
                    value={settings.defaultNotebookId ?? 'auto'}
                    onChange={(e) => props.onUpdate({ defaultNotebookId: e.target.value === 'auto' ? null : e.target.value })}
                    className="w-full rounded bg-zinc-100 px-2 py-1.5 text-sm outline-none dark:bg-zinc-800"
                  >
                    <option value="auto">Auto (first notebook)</option>
                    {props.notebooks.map((n) => (
                      <option key={n.id} value={n.id}>{notebookPath(props.notebooks, n.id)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-sm font-medium">Markdown file mirror</div>
                  <p className="mb-2 text-xs opacity-60">
                    Every note as a <code>.md</code> file with frontmatter — local-first,
                    git-ready. Desktop app only.
                  </p>
                  <p className="mb-2 truncate font-mono text-xs opacity-60" title={props.mirrorDir ?? ''}>
                    {props.mirrorDir ?? 'Not initialized yet — export to create ~/devnote'}
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs text-[var(--accent-fg)] hover:opacity-90"
                      onClick={props.onExportMirror}
                    >
                      Export now
                    </button>
                    <button
                      className="rounded bg-zinc-200 px-3 py-1.5 text-xs hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                      onClick={props.onImportMirror}
                    >
                      Import
                    </button>
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-sm font-medium">Git sync</div>
                  <p className="mb-2 text-xs opacity-60">
                    Auto-commit + pull + push. Conflicts resolved by newer <code>updatedAt</code>;
                    loser kept as a reviewable note.
                  </p>
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${
                      props.syncState === 'clean' ? 'bg-green-500' :
                      props.syncState === 'conflict' || props.syncState === 'diverged' ? 'bg-red-500' :
                      props.syncState === 'ahead' ? 'bg-sky-500' :
                      props.syncState === 'behind' ? 'bg-orange-500' :
                      props.syncState === 'dirty' ? 'bg-amber-500' :
                      'bg-zinc-400'
                    }`} />
                    <span className="text-xs opacity-70">{
                      props.syncState === 'no-git' ? 'Git not installed' :
                      props.syncState === 'no-repo' ? 'No sync repo (Export first)' :
                      props.syncState === 'clean' ? 'Synced' :
                      props.syncState
                    }</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={props.remoteUrl ?? ''}
                      onChange={(e) => props.onSetRemote(e.target.value)}
                      placeholder="Remote URL (e.g. git@github.com:user/devnote.git)"
                      className="flex-1 rounded bg-zinc-100 px-2 py-1.5 text-xs font-mono dark:bg-zinc-800"
                    />
                    <button
                      className="rounded bg-zinc-200 px-3 py-1.5 text-xs hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                      disabled={props.syncBusy}
                      onClick={props.onSyncNow}
                    >
                      <Refresh size={13} className={props.syncBusy ? 'inline animate-spin' : 'inline'} /> Sync now
                    </button>
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-sm font-medium">Backup & restore</div>
                  <p className="mb-2 text-xs opacity-60">
                    Zip export of all notes. Restore overwrites <code>~/devnote</code>.
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="rounded bg-zinc-200 px-3 py-1.5 text-xs hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                      onClick={props.onBackupZip}
                    >
                      Export backup (.zip)
                    </button>
                    <button
                      className="rounded bg-zinc-200 px-3 py-1.5 text-xs hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                      onClick={props.onRestoreZip}
                    >
                      Restore from backup
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tab === 'appearance' && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Theme</div>
                <p className="text-xs opacity-60">
                  Also switchable from Telescope (<code>mod+K</code>, <code>h</code> source).
                </p>
                {BUNDLED_THEMES.map((t) => {
                  const swatch = {
                    bg: t.variables?.['--bg'] ?? FALLBACK_SWATCH[t.id]?.bg ?? '#888',
                    accent: t.variables?.['--accent'] ?? FALLBACK_SWATCH[t.id]?.accent ?? '#888',
                  };
                  return (
                    <label
                      key={t.id}
                      className={`flex cursor-pointer items-center gap-3 rounded border px-3 py-2 text-sm ${settings.theme === t.id ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)]'}`}
                    >
                      <input
                        type="radio"
                        name="pref-theme"
                        checked={settings.theme === t.id}
                        onChange={() => props.onUpdate({ theme: t.id })}
                        className="accent-sky-600"
                      />
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-black/10"
                        style={{ background: swatch.bg }}
                        aria-hidden
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: swatch.accent }} />
                      </span>
                      <span className="font-medium">{t.name}</span>
                      <span className="text-xs opacity-60">{t.hint}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {tab === 'editing' && (
              <div className="space-y-4">
                <p className="text-xs opacity-60">
                  Formatting lives in the selection bubble menu; type <kbd className="rounded bg-zinc-100 px-1 font-mono dark:bg-zinc-800">/</kbd> for blocks.
                </p>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.wordWrap}
                    onChange={(e) => props.onUpdate({ wordWrap: e.target.checked })}
                    className="accent-sky-600"
                  />
                  Word wrap in editor
                </label>
                <div>
                  <label htmlFor="pref-font-size" className="mb-1 block text-sm">
                    Editor font size: <span className="font-medium">{settings.fontSize.toFixed(1)}px</span>
                  </label>
                  <input
                    id="pref-font-size"
                    type="range"
                    min={11}
                    max={18}
                    step={0.5}
                    value={settings.fontSize}
                    onChange={(e) => props.onUpdate({ fontSize: Number(e.target.value) })}
                    className="w-full accent-sky-600"
                  />
                </div>
              </div>
            )}

            {tab === 'shortcuts' && (
              <div>
                <p className="mb-2 text-xs opacity-60">
                  Every action is a <code>core:*</code> command. Custom remapping lands in Phase 4 —
                  all shortcuts also work from Telescope (<code>mod+K</code>, <code>&gt;</code> source).
                </p>
                <table className="w-full text-sm">
                  <tbody>
                    {COMMAND_META.map((c) => (
                      <tr key={c.id} className="border-b border-[var(--border-soft)]">
                        <td className="py-1.5 pr-2">{c.title}</td>
                        <td className="py-1.5 text-right">
                          {c.binding ? (
                            <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] dark:bg-zinc-800">
                              {c.binding.replace('mod', modLabel())}
                            </kbd>
                          ) : (
                            <span className="font-mono text-[11px] opacity-50">{c.id}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
