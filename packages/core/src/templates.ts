// Note templates (Inkdrop parity: reference/note-templates).
// Custom templates live in the store; built-ins ship here (read-only).
// Supported `_template` frontmatter subset: title, description, tags,
// notebook, status. Placeholders: {{ 'now' | date: '%Y-%m-%d' }}, {% uuid %}.
// `> # !Instructions` blockquote groups are stripped from generated notes.
import { parse as parseYaml } from 'yaml';
import { NOTE_STATUSES, generateId } from './types';
import type { NoteStatus, Template } from './types';

export interface TemplateConfig {
  title?: string;
  description?: string;
  tags?: string[];
  notebook?: string;
  status?: NoteStatus;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Split leading `---` YAML frontmatter; returns config + remaining content. */
export function parseTemplateBody(body: string): { config: TemplateConfig; content: string } {
  const empty = { config: {}, content: body };
  const lines = body.split('\n');
  if (lines[0]?.trim() !== '---') return empty;
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (close === -1) return empty;
  let raw: unknown;
  try {
    raw = parseYaml(lines.slice(1, close).join('\n'));
  } catch {
    return { config: {}, content: lines.slice(close + 1).join('\n') };
  }
  const block = isRecord(raw) && isRecord(raw._template) ? raw._template : {};
  const config: TemplateConfig = {};
  if (typeof block.title === 'string' && block.title.trim() !== '') config.title = block.title;
  if (typeof block.description === 'string') config.description = block.description;
  if (Array.isArray(block.tags)) {
    const tags = block.tags.filter((t): t is string => typeof t === 'string' && t.trim() !== '');
    if (tags.length > 0) config.tags = tags;
  }
  if (typeof block.notebook === 'string' && block.notebook.trim() !== '') config.notebook = block.notebook;
  if (typeof block.status === 'string' && (NOTE_STATUSES as string[]).includes(block.status)) {
    config.status = block.status as NoteStatus;
  }
  return { config, content: lines.slice(close + 1).join('\n') };
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Minimal strftime for template dates (local time). */
export function formatTemplateDate(now: Date, fmt: string): string {
  return fmt.replace(/%[YmdHMSAaBb%]/g, (tok) => {
    switch (tok) {
      case '%Y': return String(now.getFullYear());
      case '%m': return pad(now.getMonth() + 1);
      case '%d': return pad(now.getDate());
      case '%H': return pad(now.getHours());
      case '%M': return pad(now.getMinutes());
      case '%S': return pad(now.getSeconds());
      case '%A': return WEEKDAYS[now.getDay()] ?? '';
      case '%a': return (WEEKDAYS[now.getDay()] ?? '').slice(0, 3);
      case '%B': return MONTHS[now.getMonth()] ?? '';
      case '%b': return (MONTHS[now.getMonth()] ?? '').slice(0, 3);
      case '%%': return '%';
      default: return tok;
    }
  });
}

/** Fill `{{ 'now' | date: 'fmt' }}` and `{% uuid %}` placeholders. */
export function renderTemplateText(text: string, now: Date = new Date()): string {
  return text
    .replace(/\{\{\s*['"]now['"]\s*\|\s*date:\s*['"]([^'"]*)['"]\s*\}\}/g, (_, fmt: string) =>
      formatTemplateDate(now, fmt),
    )
    .replace(/\{%\s*uuid\s*%}/g, () => generateId());
}

/**
 * Drop blockquote groups whose first heading starts with `!`
 * (e.g. `> # !Instructions`). Line-based on purpose: no AST round-trip,
 * so user Markdown bytes are otherwise untouched.
 */
export function stripInstructionBlocks(content: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!/^\s*>/.test(lines[i] ?? '')) {
      out.push(lines[i] ?? '');
      i += 1;
      continue;
    }
    const group: string[] = [];
    while (i < lines.length && /^\s*>/.test(lines[i] ?? '')) {
      group.push(lines[i] ?? '');
      i += 1;
    }
    const inner = group.map((l) => l.replace(/^\s*>\s?/, ''));
    const first = inner.find((l) => l.trim() !== '');
    if (first !== undefined && /^#{1,6}\s*!/.test(first.trim())) continue; // instructions — drop
    out.push(...group);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export interface AppliedTemplate {
  title: string;
  body: string;
  tags: string[];
  status: NoteStatus;
  /** Resolved description (template's own wins over frontmatter). */
  description?: string;
}

/**
 * Apply a template to note inputs (Inkdrop parity):
 * - title: template title wins when the note is untitled, else kept
 * - tags: union (existing kept, template adds)
 * - status: template's wins when the note has none, else kept
 */
export function applyTemplate(
  template: Template,
  note: { title: string; tags: string[]; status: NoteStatus },
  now: Date = new Date(),
): AppliedTemplate {
  const { config, content } = parseTemplateBody(template.body);
  const body = renderTemplateText(stripInstructionBlocks(content), now);
  const renderedTitle = config.title !== undefined ? renderTemplateText(config.title, now) : template.name;
  const title = note.title.trim() === '' ? renderedTitle : note.title;
  const tags = [...note.tags];
  for (const t of config.tags ?? []) {
    if (!tags.includes(t)) tags.push(t);
  }
  const status = note.status === 'none' && config.status !== undefined ? config.status : note.status;
  return { title, body, tags, status, description: template.description ?? config.description };
}

/** Recently-used template ids, most recent first, capped. */
export function markTemplateUsed(recents: string[], id: string, cap = 5): string[] {
  return [id, ...recents.filter((r) => r !== id)].slice(0, cap);
}

export function createCustomTemplate(
  customs: Template[],
  input: { name: string; body: string; description?: string },
): Template[] {
  const name = input.name.trim();
  if (name === '') throw new Error('template name must not be empty');
  const now = new Date().toISOString();
  void now;
  return [...customs, { id: generateId(), name, body: input.body, description: input.description }];
}

export function updateCustomTemplate(
  customs: Template[],
  all: Template[],
  id: string,
  patch: { name?: string; body?: string; description?: string },
): Template[] {
  const target = all.find((t) => t.id === id);
  if (!target) throw new Error(`template not found: ${id}`);
  if (target.builtin) throw new Error('built-in templates are read-only — duplicate it first');
  if (patch.name !== undefined && patch.name.trim() === '') throw new Error('template name must not be empty');
  return customs.map((t) =>
    t.id === id
      ? { ...t, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}), ...(patch.body !== undefined ? { body: patch.body } : {}), ...(patch.description !== undefined ? { description: patch.description } : {}) }
      : t,
  );
}

export function deleteCustomTemplate(customs: Template[], all: Template[], id: string): Template[] {
  const target = all.find((t) => t.id === id);
  if (!target) throw new Error(`template not found: ${id}`);
  if (target.builtin) throw new Error('built-in templates cannot be deleted');
  return customs.filter((t) => t.id !== id);
}

/** Copy any template (incl. built-ins) into a new custom template. */
export function duplicateAsCustom(customs: Template[], all: Template[], id: string): { customs: Template[]; template: Template } {
  const target = all.find((t) => t.id === id);
  if (!target) throw new Error(`template not found: ${id}`);
  const copy: Template = {
    id: generateId(),
    name: `${target.name} copy`,
    body: target.body,
    description: target.description,
  };
  return { customs: [...customs, copy], template: copy };
}

// ---------- built-ins (original content, Inkdrop-style categories) ----------

const DAILY = `---
_template:
  title: "{{ 'now' | date: '%Y-%m-%d' }} - Daily Report"
  description: What I did today, what I plan for tomorrow, and any blockers.
  tags:
    - report
---

> # !Instructions
> Fill in one line per item. This block never lands in your note.

## What I worked on

1.

## Blockers

1.

## Tomorrow

1.
`;

const BUGFIX = `---
_template:
  description: Repro, root cause, fix, and verification for a bug.
  tags:
    - bug
  status: active
---

> # !Instructions
> Write the repro first — if you can't repro it, you can't verify the fix.

## Symptoms

## Repro steps

1.

## Root cause

## Fix

## Verification

- [ ] Repro passes
- [ ] No regressions
`;

const FEATURE = `---
_template:
  description: Goal, non-goals, proposal, risks, and rollout for a feature.
  tags:
    - planning
---

## Goal

## Non-goals

## Proposal

## Risks

## Rollout

1.
`;

const IMPL = `---
_template:
  description: Concrete implementation plan with steps and testing.
  tags:
    - plan
---

## Context

## Steps

1. [ ] Step one

## Testing

## UID: {% uuid %}
`;

const CONCEPT = `---
_template:
  description: Learn a concept by explaining it back in your own words.
  tags:
    - learning
---

## Concept

## In my own words

## Open questions

- ?
`;

const CODEBASE = `---
_template:
  description: Map an unfamiliar codebase fast.
  tags:
    - learning
---

## Map

- Entry point:
- Core modules:

## Surprises

## Open questions

- ?
`;

export const BUILTIN_TEMPLATES: Template[] = [
  { id: 'builtin-daily-report', name: 'Daily Report', body: DAILY, builtin: true, category: 'Productivity', description: 'What I did today, blockers, and tomorrow.' },
  { id: 'builtin-bug-fix', name: 'Bug fix', body: BUGFIX, builtin: true, category: 'Debugging', description: 'Repro, cause, fix, verification.' },
  { id: 'builtin-feature-planning', name: 'Feature planning', body: FEATURE, builtin: true, category: 'Planning', description: 'Goal, proposal, risks, rollout.' },
  { id: 'builtin-implementation-plan', name: 'Implementation plan', body: IMPL, builtin: true, category: 'Planning', description: 'Steps and testing. Includes a {% uuid %} run id.' },
  { id: 'builtin-concept-deep-dive', name: 'Concept deep dive', body: CONCEPT, builtin: true, category: 'Learning', description: 'Explain it back in your own words.' },
  { id: 'builtin-codebase-exploration', name: 'Codebase exploration', body: CODEBASE, builtin: true, category: 'Learning', description: 'Map an unfamiliar codebase fast.' },
];
