import { describe, expect, it } from 'vitest';
import {
  BUILTIN_TEMPLATES,
  applyTemplate,
  createCustomTemplate,
  deleteCustomTemplate,
  duplicateAsCustom,
  formatTemplateDate,
  markTemplateUsed,
  parseTemplateBody,
  renderTemplateText,
  stripInstructionBlocks,
  updateCustomTemplate,
} from './index';

describe('parseTemplateBody', () => {
  it('extracts the _template block and content', () => {
    const { config, content } = parseTemplateBody(BUILTIN_TEMPLATES[0]!.body);
    expect(config).toMatchObject({ tags: ['report'] });
    expect(config.title).toContain('Daily Report');
    expect(content).toContain('## What I worked on');
    expect(content).not.toContain('_template:');
  });

  it('tolerates missing or broken frontmatter', () => {
    expect(parseTemplateBody('no frontmatter')).toMatchObject({ config: {}, content: 'no frontmatter' });
    expect(parseTemplateBody('---\n: broken [\n---\nbody').content).toBe('body');
  });

  it('rejects invalid status', () => {
    const { config } = parseTemplateBody('---\n_template:\n  status: bogus\n---\nbody');
    expect(config.status).toBeUndefined();
  });
});

describe('renderTemplateText', () => {
  const now = new Date(2026, 6, 16, 9, 5, 0); // local time, deterministic
  it('fills date and uuid placeholders', () => {
    expect(renderTemplateText(`{{ 'now' | date: '%Y-%m-%d' }}`, now)).toBe('2026-07-16');
    expect(renderTemplateText(`{{ "now" | date: "%A" }}`, now)).toBe('Thursday');
    const uuid = renderTemplateText('id: {% uuid %} id2: {%uuid%}', now);
    const ids = uuid.match(/id: (\S+) id2: (\S+)/);
    expect(ids?.[1]).toMatch(/^[0-9a-f-]{36}$|id-[0-9a-z-]+/);
    expect(ids?.[1]).not.toBe(ids?.[2]);
  });

  it('formats date tokens', () => {
    expect(formatTemplateDate(now, '%Y/%m/%d %H:%M')).toBe('2026/07/16 09:05');
  });
});

describe('stripInstructionBlocks', () => {
  it('drops > # ! groups, keeps the rest byte-identical', () => {
    const out = stripInstructionBlocks('> # !Instructions\n> do this\n\n## Real\n\n> normal quote\n> more\n');
    expect(out).not.toContain('Instructions');
    expect(out).toContain('## Real');
    expect(out).toContain('> normal quote\n> more');
  });
});

describe('applyTemplate', () => {
  const daily = BUILTIN_TEMPLATES[0]!;
  const now = new Date(2026, 6, 16);
  it('fills an empty note fully', () => {
    const applied = applyTemplate(daily, { title: '', tags: [], status: 'none' }, now);
    expect(applied.title).toBe('2026-07-16 - Daily Report');
    expect(applied.body).toContain('## Blockers');
    expect(applied.body).not.toContain('!Instructions');
    expect(applied.tags).toEqual(['report']);
  });

  it('keeps existing title/tags/status (union)', () => {
    const applied = applyTemplate(daily, { title: 'Mine', tags: ['x'], status: 'active' }, now);
    expect(applied.title).toBe('Mine');
    expect(applied.tags).toEqual(['x', 'report']);
    expect(applied.status).toBe('active');
  });

  it('applies template status when the note has none', () => {
    const bug = BUILTIN_TEMPLATES.find((t) => t.id === 'builtin-bug-fix')!;
    const applied = applyTemplate(bug, { title: '', tags: [], status: 'none' }, now);
    expect(applied.status).toBe('active');
  });
});

describe('custom template CRUD', () => {
  it('creates, protects built-ins, recents cap', () => {
    let customs = createCustomTemplate([], { name: ' Mine ', body: 'hi' });
    expect(customs[0]?.name).toBe('Mine');
    expect(() => createCustomTemplate([], { name: '  ', body: '' })).toThrow(/empty/);

    const all = [...customs, ...BUILTIN_TEMPLATES];
    expect(() => updateCustomTemplate(customs, all, 'builtin-daily-report', { body: 'x' })).toThrow(/read-only/);
    expect(() => deleteCustomTemplate(customs, all, 'builtin-daily-report')).toThrow(/cannot be deleted/);
    customs = updateCustomTemplate(customs, all, customs[0]!.id, { body: 'v2' });
    expect(customs[0]?.body).toBe('v2');

    const { customs: duped, template } = duplicateAsCustom(customs, all, 'builtin-daily-report');
    expect(template.builtin).toBeUndefined();
    expect(template.name).toContain('copy');
    expect(duplicateAsCustom(duped, [...duped, ...BUILTIN_TEMPLATES], template.id).customs).toHaveLength(3);

    expect(markTemplateUsed(['a', 'b'], 'c')).toEqual(['c', 'a', 'b']);
    expect(markTemplateUsed(['a', 'b', 'c', 'd', 'e', 'f'], 'g')).toHaveLength(5);
  });
});
