import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { CloseCircle, Copy, Edit, Plus, Trash } from 'reicon-react';
import { parseTemplateBody, renderTemplateText, stripInstructionBlocks } from '@devnote/core';
import type { Template } from '@devnote/core';

// Preview stack is already code-split — reuse it here.
const PreviewView = lazy(() => import('./PreviewView'));

interface Props {
  templates: Template[];
  recents: string[];
  onApply: (id: string) => void;
  onCreate: (input: { name: string; body: string; description?: string }) => string | null;
  onUpdate: (id: string, patch: { name?: string; body?: string; description?: string }) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => string | null;
  onClose: () => void;
}

interface EditDraft {
  mode: 'new' | 'edit';
  id?: string;
  name: string;
  body: string;
  description: string;
}

/** Choose-a-template picker: filter + browse + live preview + manage customs. */
export default function TemplatePicker(props: Props) {
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const recent = props.recents.find((id) => props.templates.some((t) => t.id === id));
    return recent ?? props.templates[0]?.id ?? null;
  });
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    filterRef.current?.focus();
  }, []);

  const q = filter.trim().toLowerCase();
  const matches = (t: Template): boolean =>
    q === '' || t.name.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q);

  const customs = props.templates.filter((t) => !t.builtin && matches(t));
  const builtins = props.templates.filter((t) => t.builtin && matches(t));
  const recentTpls = q === ''
    ? props.recents
      .map((id) => props.templates.find((t) => t.id === id))
      .filter((t): t is Template => t !== undefined)
    : [];
  const categories = useMemo(() => {
    const order: string[] = [];
    for (const t of builtins) {
      const c = t.category ?? 'Other';
      if (!order.includes(c)) order.push(c);
    }
    return order;
  }, [builtins]);

  // Flat keyboard-navigation order: recents, customs, then built-ins by category.
  const flat: Template[] = useMemo(() => {
    const list: Template[] = [...recentTpls, ...customs];
    for (const c of categories) list.push(...builtins.filter((t) => (t.category ?? 'Other') === c));
    return list.filter((t, i) => list.findIndex((x) => x.id === t.id) === i);
  }, [recentTpls, customs, builtins, categories]);

  useEffect(() => {
    if (selectedId !== null && !flat.some((t) => t.id === selectedId)) {
      setSelectedId(flat[0]?.id ?? null);
    }
  }, [flat, selectedId]);

  const selected = props.templates.find((t) => t.id === selectedId) ?? null;

  const move = (dir: 1 | -1) => {
    if (flat.length === 0) return;
    const at = flat.findIndex((t) => t.id === selectedId);
    const next = flat[(at + dir + flat.length) % flat.length];
    if (next) {
      setSelectedId(next.id);
      document.getElementById(`tpl-${next.id}`)?.scrollIntoView({ block: 'nearest' });
    }
  };

  const startEdit = () => {
    if (!selected) return;
    if (selected.builtin) {
      // Editing a built-in saves a custom copy.
      const id = props.onDuplicate(selected.id);
      if (id === null) return;
      setSelectedId(id);
      setEditing({ mode: 'edit', id, name: `${selected.name} copy`, body: selected.body, description: selected.description ?? '' });
      return;
    }
    setEditing({ mode: 'edit', id: selected.id, name: selected.name, body: selected.body, description: selected.description ?? '' });
  };

  const saveEdit = () => {
    if (!editing) return;
    if (editing.mode === 'new') {
      const id = props.onCreate({ name: editing.name, body: editing.body, description: editing.description });
      if (id) setSelectedId(id);
    } else if (editing.id) {
      props.onUpdate(editing.id, { name: editing.name, body: editing.body, description: editing.description });
    }
    setEditing(null);
  };

  const remove = () => {
    if (!selected || selected.builtin) return;
    // TODO(Phase 2.5): custom confirm dialog instead of window.confirm.
    if (window.confirm(`Delete template "${selected.name}"?`)) {
      props.onDelete(selected.id);
      setSelectedId(null);
    }
  };

  const previewOf = (t: Template): { description?: string; markdown: string; meta: string } => {
    const { config, content } = parseTemplateBody(t.body);
    const markdown = renderTemplateText(stripInstructionBlocks(content));
    const meta = [
      t.builtin ? (t.category ?? 'Built-in') : 'Custom',
      ...(config.tags ?? []).map((x) => `#${x}`),
      config.status && config.status !== 'none' ? config.status : '',
    ].filter(Boolean).join(' · ');
    return { description: t.description ?? config.description, markdown, meta };
  };

  const renderRow = (t: Template): React.ReactNode => {
    const isSel = t.id === selectedId;
    const inRecents = recentTpls.some((r) => r.id === t.id);
    return (
      <button
        key={`${t.builtin === true ? 'b' : 'c'}-${t.id}`}
        id={`tpl-${t.id}`}
        onClick={() => { setSelectedId(t.id); }}
        onDoubleClick={() => props.onApply(t.id)}
        className={`block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${isSel ? 'bg-[var(--accent-soft)]' : ''}`}
        title={t.description ?? t.name}
      >
        <span className="truncate">{t.name}</span>
        {!t.builtin && !inRecents && <span className="ml-1.5 text-[10px] uppercase opacity-50">custom</span>}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={props.onClose}>
      <div
        className="flex h-[480px] w-[680px] max-w-[92vw] flex-col rounded-lg bg-[var(--bg-raised)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (editing) {
            if (e.key === 'Escape') setEditing(null);
            return;
          }
          if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
          else if (e.key === 'Enter' && selectedId !== null) { e.preventDefault(); props.onApply(selectedId); }
          else if (e.key === 'Escape') props.onClose();
        }}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] p-3">
          <input
            ref={filterRef}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Choose a template… (↑↓ browse, Enter apply)"
            className="flex-1 rounded bg-zinc-100 px-3 py-1.5 text-sm outline-none dark:bg-zinc-800"
          />
          <button className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={props.onClose} title="Close (Esc)">
            <CloseCircle size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="w-60 shrink-0 overflow-y-auto border-r border-[var(--border)] p-2">
            {recentTpls.length > 0 && (
              <>
                <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase opacity-50">Recently used</div>
                {recentTpls.map(renderRow)}
              </>
            )}
            {customs.length > 0 && (
              <>
                <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase opacity-50">Custom</div>
                {customs.map(renderRow)}
              </>
            )}
            {categories.map((c) => (
              <div key={c}>
                <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase opacity-50">{c}</div>
                {builtins.filter((t) => (t.category ?? 'Other') === c).map(renderRow)}
              </div>
            ))}
            {flat.length === 0 && (
              <div className="px-2 py-6 text-center text-sm opacity-50">No templates match</div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            {editing ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Template name"
                  className="rounded bg-zinc-100 px-2 py-1.5 text-sm font-semibold outline-none dark:bg-zinc-800"
                />
                <input
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Description (optional)"
                  className="rounded bg-zinc-100 px-2 py-1.5 text-xs outline-none dark:bg-zinc-800"
                />
                <textarea
                  value={editing.body}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                  placeholder={'Markdown body — supports _template frontmatter, {{ date }}, {% uuid %}'}
                  className="min-h-0 flex-1 resize-none rounded bg-zinc-100 p-2 font-mono text-xs outline-none dark:bg-zinc-800"
                />
                <div className="flex justify-end gap-2">
                  <button className="rounded px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => setEditing(null)}>Cancel</button>
                  <button className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent-fg)] hover:opacity-90" onClick={saveEdit}>Save</button>
                </div>
              </div>
            ) : selected !== null ? (
              <>
                <div className="border-b border-[var(--border)] px-4 py-2">
                  <div className="text-sm font-semibold">{selected.name}</div>
                  {previewOf(selected).description && (
                    <div className="text-xs opacity-60">{previewOf(selected).description}</div>
                  )}
                  <div className="text-[11px] opacity-50">{previewOf(selected).meta}</div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
                  <Suspense fallback={<div className="py-6 text-center text-sm opacity-50">Loading preview…</div>}>
                    <PreviewView markdown={previewOf(selected).markdown} />
                  </Suspense>
                </div>
                <div className="flex items-center gap-1 border-t border-[var(--border)] px-3 py-2">
                  <button className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800" title="New custom template" onClick={() => setEditing({ mode: 'new', name: '', body: '', description: '' })}>
                    <Plus size={13} /> New
                  </button>
                  <button className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800" title={selected.builtin ? 'Edit a copy (built-ins are read-only)' : 'Edit template'} onClick={startEdit}>
                    <Edit size={13} /> Edit
                  </button>
                  <button className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Duplicate as custom" onClick={() => { const id = props.onDuplicate(selected.id); if (id) setSelectedId(id); }}>
                    <Copy size={13} /> Duplicate
                  </button>
                  {!selected.builtin && (
                    <button className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-100 dark:hover:bg-red-900" onClick={remove}>
                      <Trash size={13} /> Delete
                    </button>
                  )}
                  <span className="ml-auto" />
                  <button className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs text-[var(--accent-fg)] hover:opacity-90" onClick={() => props.onApply(selected.id)}>
                    Apply ↵
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm opacity-50">Select a template</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
