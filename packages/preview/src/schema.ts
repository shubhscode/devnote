// Extended sanitize schema: default (GitHub) + classes needed for
// syntax highlight, alerts, task lists, footnotes, and color swatches.
// Raw HTML is parsed (rehype-raw) then filtered here — never skipped.
import { defaultSchema, type Schema } from 'hast-util-sanitize';

type AttrList = Exclude<Schema['attributes'], undefined>[string];

const EXTRA_ATTRS: Record<string, string[]> = {
  '*': ['className'],
  a: ['className'],
  h1: ['className', 'id', 'dataHeadingIndex'],
  h2: ['className', 'id', 'dataHeadingIndex'],
  h3: ['className', 'id', 'dataHeadingIndex'],
  h4: ['className', 'id', 'dataHeadingIndex'],
  h5: ['className', 'id', 'dataHeadingIndex'],
  h6: ['className', 'id', 'dataHeadingIndex'],
  ul: ['className'],
  ol: ['className'],
  section: ['className'],
  // Task round-trip (2.4): type/checked survive, disabled is stripped by the
  // indexer plugin, dataTaskIndex survives for the click handler.
  input: ['className', 'type', 'checked', 'dataTaskIndex'],
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
  // Deviate from GitHub here: upstream forces `disabled` on every input
  // (`required.input`). Our task checkboxes are click targets wired to our
  // own round-trip handler (no <form> exists), so enabled inputs are safe.
  required: {},
};
