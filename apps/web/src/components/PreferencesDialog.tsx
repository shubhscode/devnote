import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { CloseCircle, Edit, Keyboard, Palette, Refresh, Sliders } from 'reicon-react';
import { BUNDLED_THEMES, notebookPath } from '@devnote/core';
import type { Notebook, NoteSortKey } from '@devnote/core';
import { isValidGitRemote } from '@devnote/sync';
import { COMMAND_META } from '../lib/commands';
import { modLabel } from '../lib/keys';
import { useFocusTrap } from '../lib/focusTrap';
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
  /** False in browsers (no native file picker) — restore stays disabled. */
  canPickFiles: boolean;
  onClose: () => void;
}

type Tab = 'general' | 'sync' | 'appearance' | 'editing' | 'shortcuts';

const TABS: { id: Tab; label: string; icon: React.ReactNode; title: string }[] = [
  { id: 'general', label: 'General', icon: <Sliders size={15} />, title: 'General settings (default notebook)' },
  { id: 'sync', label: 'Sync', icon: <Refresh size={15} />, title: 'File mirror, git sync, backup' },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={15} />, title: 'Themes, dark/light, font size' },
  { id: 'editing', label: 'Editing', icon: <Edit size={15} />, title: 'Word wrap, toolbar, shortcuts' },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={15} />, title: 'Keybindings reference' },
];

const FALLBACK_SWATCH: Record<string, { bg: string; accent: string }> = {
  light: { bg: '#ffffff', accent: '#0284c7' },
  dark: { bg: '#09090b', accent: '#0284c7' },
  system: { bg: 'linear-gradient(135deg, #ffffff 50%, #09090b 50%)', accent: '#0284c7' },
};

const SYNC_LABELS: Record<string, string> = {
  clean: 'Synced',
  dirty: 'Uncommitted changes',
  ahead: 'Unpushed commits',
  behind: 'Remote updates available',
  diverged: 'Diverged — needs attention',
  conflict: 'Conflict — review needed',
  'no-git': 'Git not installed',
  'no-repo': 'No sync repo (Export first)',
};

const SYNC_DOT: Record<string, string> = {
  clean: 'bg-green-500',
  dirty: 'bg-amber-500',
  ahead: 'bg-sky-500',
  behind: 'bg-orange-500',
  diverged: 'bg-red-500',
  conflict: 'bg-red-500',
};

const SORT_OPTIONS: { id: NoteSortKey; label: string; hint: string }[] = [
  { id: 'updated', label: 'Last updated', hint: 'Edited notes float to the top' },
  { id: 'created', label: 'Newest first', hint: 'Stable chronological order' },
  { id: 'title', label: 'Title A–Z', hint: 'Alphabetical (search still ranks by relevance)' },
];

/** Bordered settings card: title + description + controls. */
function Section(props: { title: string; desc?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--border)] p-3.5">
      <h3 className="text-sm font-medium">{props.title}</h3>
      {props.desc && <p className="mb-2.5 mt-0.5 text-xs opacity-60">{props.desc}</p>}
      <div className={props.desc ? '' : 'mt-2.5'}>{props.children}</div>
    </section>
  );
}

const BTN_SECONDARY =
  'rounded bg-zinc-200 px-3 py-1.5 text-xs hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 disabled:opacity-40';
const BTN_PRIMARY =
  'rounded bg-[var(--accent)] px-3 py-1.5 text-xs text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-40';

export default function PreferencesDialog(props: Props) {
  const [tab, setTab] = useState<Tab>('general');
  const [shortcutFilter, setShortcutFilter] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef);
  const { settings } = props;

  // Remote URL draft: editing stays local (no per-keystroke git invoke);
  // commits on blur/Enter, reverts on Escape.
  const [remoteDraft, setRemoteDraft] = useState<string | null>(null);
  useEffect(() => { setRemoteDraft(null); }, [props.remoteUrl]);
  const remoteShown = remoteDraft ?? props.remoteUrl ?? '';
  const remoteValid = remoteShown.trim() === '' || isValidGitRemote(remoteShown);
  const commitRemote = () => {
    const next = remoteShown.trim();
    if (remoteValid && next !== (props.remoteUrl ?? '')) props.onSetRemote(next);
    setRemoteDraft(null);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [props]);

  const visibleCommands = useMemo(() => {
    const q = shortcutFilter.trim().toLowerCase();
    if (q === '') return COMMAND_META;
    return COMMAND_META.filter(
      (c) => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    );
  }, [shortcutFilter]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={props.onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -4 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        aria-label="Preferences"
        ref={panelRef}
        className="flex h-[480px] w-[640px] max-w-[94vw] flex-col rounded-xl bg-[var(--bg-raised)] shadow-2xl"
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
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${tab === t.id ? 'bg-[var(--accent-soft)] font-medium' : ''}`}
              >
                <span className="opacity-70">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            {tab === 'general' && (
              <div className="space-y-3">
                <Section
                  title="Default notebook"
                  desc="New notes created from All Notes land here."
                >
                  <select
                    aria-label="Default notebook"
                    value={settings.defaultNotebookId ?? 'auto'}
                    onChange={(e) => props.onUpdate({ defaultNotebookId: e.target.value === 'auto' ? null : e.target.value })}
                    className="w-full rounded-lg bg-zinc-100 px-2 py-1.5 text-sm outline-none dark:bg-zinc-800"
                  >
                    <option value="auto">Auto (first notebook)</option>
                    {props.notebooks.map((n) => (
                      <option key={n.id} value={n.id}>{notebookPath(props.notebooks, n.id)}</option>
                    ))}
                  </select>
                </Section>
              </div>
            )}

            {tab === 'sync' && (
              <div className="space-y-3">
                <Section
                  title="Markdown file mirror"
                  desc={<>Every note as a <code>.md</code> file with frontmatter — local-first, git-ready. Desktop app only.</>}
                >
                  <p className="mb-2 truncate font-mono text-xs opacity-60" title={props.mirrorDir ?? ''}>
                    {props.mirrorDir ?? 'Not initialized yet — export to create ~/devnote'}
                  </p>
                  <div className="flex gap-2">
                    <button className={BTN_PRIMARY} onClick={props.onExportMirror}>
                      Export now
                    </button>
                    <button className={BTN_SECONDARY} onClick={props.onImportMirror}>
                      Import
                    </button>
                  </div>
                </Section>

                <Section
                  title="Git sync"
                  desc={<>Auto-commit + pull + push. Conflicts resolve by newer <code>updatedAt</code>; the loser is kept as a reviewable note.</>}
                >
                  <div className="mb-2.5 flex items-center gap-2 rounded-lg bg-zinc-100 px-2.5 py-1.5 dark:bg-zinc-800">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${SYNC_DOT[props.syncState] ?? 'bg-zinc-400'}`} />
                    <span className="text-xs">{SYNC_LABELS[props.syncState] ?? props.syncState}</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={remoteShown}
                      onChange={(e) => setRemoteDraft(e.target.value)}
                      onBlur={commitRemote}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        else if (e.key === 'Escape') { e.stopPropagation(); setRemoteDraft(null); }
                      }}
                      placeholder="Remote URL (e.g. git@github.com:user/devnote.git)"
                      aria-label="Sync remote URL"
                      aria-invalid={!remoteValid}
                      className={`min-w-0 flex-1 rounded-lg bg-zinc-100 px-2 py-1.5 font-mono text-xs outline-none dark:bg-zinc-800 ${!remoteValid ? 'ring-1 ring-red-500' : ''}`}
                    />
                    <button
                      className={BTN_SECONDARY}
                      disabled={props.syncBusy}
                      onClick={props.onSyncNow}
                    >
                      <Refresh size={13} className={props.syncBusy ? 'inline animate-spin' : 'inline'} /> Sync now
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs opacity-60">
                    HTTPS (<code>https://host/user/repo.git</code>) or SSH (<code>git@host:user/repo.git</code>). The repo must exist and stay private.
                  </p>
                  {!remoteValid && (
                    <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                      Not a git remote — use an https:// URL or git@host:path form.
                    </p>
                  )}
                </Section>

                <Section
                  title="Backup & restore"
                  desc={<>Zip export of all notes. Restore overwrites <code>~/devnote</code>.{!props.canPickFiles && <> Restore needs the desktop app.</>}</>}
                >
                  <div className="flex gap-2">
                    <button className={BTN_SECONDARY} onClick={props.onBackupZip}>
                      Export backup (.zip)
                    </button>
                    <button
                      className={BTN_SECONDARY}
                      onClick={props.onRestoreZip}
                      disabled={!props.canPickFiles}
                      title={props.canPickFiles ? 'Pick a .zip backup to restore' : 'Restore needs the desktop app — browsers cannot read .zip files from disk'}
                    >
                      Restore from backup
                    </button>
                  </div>
                </Section>
              </div>
            )}

            {tab === 'appearance' && (
              <div className="space-y-3">
                <Section
                  title="Theme"
                  desc={<>Also switchable from Telescope (<code>mod+K</code>, <code>h</code> source).</>}
                >
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Theme">
                    {BUNDLED_THEMES.map((t) => {
                      const selected = settings.theme === t.id;
                      const swatch = {
                        bg: t.variables?.['--bg'] ?? FALLBACK_SWATCH[t.id]?.bg ?? '#888',
                        accent: t.variables?.['--accent'] ?? FALLBACK_SWATCH[t.id]?.accent ?? '#888',
                      };
                      return (
                        <label
                          key={t.id}
                          title={t.hint ?? t.name}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 ${selected ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)] hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                        >
                          <input
                            type="radio"
                            name="pref-theme"
                            checked={selected}
                            onChange={() => props.onUpdate({ theme: t.id })}
                            className="sr-only"
                          />
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-black/10"
                            style={{ background: swatch.bg }}
                            aria-hidden
                          >
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: swatch.accent, color: '#fff' }}>
                              Ag
                            </span>
                          </span>
                          <span className="min-w-0">
                            <span className={`block truncate text-sm ${selected ? 'font-medium' : ''}`}>{t.name}</span>
                            <span className="block truncate text-[11px] opacity-60">{selected ? 'Active' : t.hint ?? 'Theme'}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </Section>
              </div>
            )}

            {tab === 'editing' && (
              <div className="space-y-3">
                <Section title="Editor">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={settings.wordWrap}
                      onChange={(e) => props.onUpdate({ wordWrap: e.target.checked })}
                      className="accent-sky-600"
                    />
                    Word wrap in editor
                  </label>
                  <div className="mt-3">
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
                </Section>

                <Section
                  title="Note list order"
                  desc="Default order when no search is active. Search results always rank by relevance."
                >
                  <div className="space-y-1" role="radiogroup" aria-label="Note list order">
                    {SORT_OPTIONS.map((o) => (
                      <label
                        key={o.id}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-sm ${settings.noteSort === o.id ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)]'}`}
                      >
                        <input
                          type="radio"
                          name="pref-sort"
                          checked={settings.noteSort === o.id}
                          onChange={() => props.onUpdate({ noteSort: o.id })}
                          className="accent-sky-600"
                        />
                        <span className="font-medium">{o.label}</span>
                        <span className="text-xs opacity-60">{o.hint}</span>
                      </label>
                    ))}
                  </div>
                </Section>

                <p className="px-1 text-xs opacity-60">
                  Formatting lives in the selection bubble menu; type <kbd className="rounded bg-zinc-100 px-1 font-mono dark:bg-zinc-800">/</kbd> for blocks, <kbd className="rounded bg-zinc-100 px-1 font-mono dark:bg-zinc-800">mod+F</kbd> to find in the note.
                </p>
              </div>
            )}

            {tab === 'shortcuts' && (
              <div>
                <input
                  type="text"
                  value={shortcutFilter}
                  onChange={(e) => setShortcutFilter(e.target.value)}
                  placeholder="Filter shortcuts…"
                  aria-label="Filter shortcuts"
                  className="mb-2 w-full rounded-lg bg-zinc-100 px-2.5 py-1.5 text-sm outline-none dark:bg-zinc-800"
                />
                <p className="mb-2 text-xs opacity-60">
                  {visibleCommands.length} of {COMMAND_META.length} commands. Every action is a <code>core:*</code> command — run any of them from Telescope (<code>mod+K</code>, <code>&gt;</code> source).
                </p>
                {visibleCommands.length === 0 && (
                  <p className="py-4 text-center text-sm opacity-50">No shortcuts match “{shortcutFilter}”.</p>
                )}
                <table className="w-full text-sm">
                  <tbody>
                    {visibleCommands.map((c) => (
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
      </motion.div>
    </motion.div>
  );
}
