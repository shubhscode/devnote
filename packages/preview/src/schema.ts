// Extended sanitize schema: default (GitHub) + classes needed for
// syntax highlight, alerts, task lists, footnotes, and color swatches.
// Raw HTML is parsed (rehype-raw) then filtered here — never skipped.
import { defaultSchema, type Schema } from 'hast-util-sanitize';

type AttrList = Exclude<Schema['attributes'], undefined>[string];

const EXTRA_ATTRS: Record<string, string[]> = {
  '*': ['className'],
  a: ['className'],
  h1: ['className'],
  h2: ['className'],
  h3: ['className'],
  h4: ['className'],
  h5: ['className'],
  h6: ['className'],
  ul: ['className'],
  ol: ['className'],
  section: ['className'],
  input: ['className'],
};

function mergeAttrs(
  base: Schema['attributes'],
  extra: Record<string, string[]>,
): Exclude<Schema['attributes'], undefined> {
  const out = { ...(base ?? {}) } as Record<string, AttrList>;
  for (const [tag, attrs] of Object.entries(extra)) {
    out[tag] = [...(out[tag] ?? []), ...attrs] as AttrList;
  }
  return out;
}

export const previewSchema: Schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'section'],
  attributes: mergeAttrs(defaultSchema.attributes, EXTRA_ATTRS),
};
