// Pure Markdown text transforms (no DOM — fully unit-tested).
// The CodeMirror adapters in view.ts are thin wrappers over these.

export interface Edit {
  /** Replacement range + text. */
  from: number;
  to: number;
  insert: string;
  /** Cursor/selection after applying. */
  selStart: number;
  selEnd: number;
}

export function applyEdit(text: string, edit: Edit): string {
  return text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
}

/**
 * Toggle an inline marker (**, *, `, ~~) around [start, end).
 * Empty selection inserts an empty pair with the cursor inside.
 */
export function toggleWrap(text: string, start: number, end: number, marker: string): Edit {
  if (start === end) {
    return {
      from: start, to: end, insert: marker + marker,
      selStart: start + marker.length, selEnd: start + marker.length,
    };
  }
  const before = text.slice(Math.max(0, start - marker.length), start);
  const after = text.slice(end, end + marker.length);
  if (before === marker && after === marker) {
    return {
      from: start - marker.length, to: end + marker.length,
      insert: text.slice(start, end),
      selStart: start - marker.length, selEnd: end - marker.length,
    };
  }
  return {
    from: start, to: end, insert: marker + text.slice(start, end) + marker,
    selStart: start + marker.length, selEnd: end + marker.length,
  };
}

function lineRanges(text: string, start: number, end: number): { lineStart: number; lineEnd: number; content: string }[] {
  const lines = text.split('\n');
  const out: { lineStart: number; lineEnd: number; content: string }[] = [];
  let offset = 0;
  const caret = start === end;
  for (const line of lines) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    const intersects = caret
      ? lineStart <= start && start <= lineEnd
      : lineStart < end && lineEnd >= start;
    if (intersects) {
      out.push({ lineStart, lineEnd, content: line });
    }
    offset = lineEnd + 1; // +1 for '\n'
  }
  return out;
}

/**
 * Toggle a line prefix (e.g. '> ', '- ', '- [ ] ') on every intersected line.
 * If all lines already carry it, strip it; otherwise add where missing.
 */
export function toggleLinePrefix(text: string, start: number, end: number, prefix: string): Edit[] {
  const ranges = lineRanges(text, start, end);
  if (ranges.length === 0) return [];
  const allHave = ranges.every((r) => r.content.startsWith(prefix));
  let shift = 0;
  return ranges.map((r) => {
    if (allHave) {
      const edit: Edit = {
        from: r.lineStart, to: r.lineStart + prefix.length, insert: '',
        selStart: 0, selEnd: 0, // recomputed below
      };
      const e = { ...edit, selStart: start + shift, selEnd: end + shift };
      shift -= prefix.length;
      return e;
    }
    if (r.content.startsWith(prefix)) {
      return { from: r.lineStart, to: r.lineStart, insert: '', selStart: start + shift, selEnd: end + shift };
    }
    const e: Edit = {
      from: r.lineStart, to: r.lineStart, insert: prefix,
      selStart: start + shift + prefix.length, selEnd: end + shift + prefix.length,
    };
    shift += prefix.length;
    return e;
  });
}

/**
 * Toggle task checkbox on intersected lines:
 * '- [ ]' -> '- [x]' -> '- [ ]'; '- ' -> '- [ ] '; plain -> '- [ ] ' prefix.
 */
export function toggleTask(text: string, start: number, end: number): Edit[] {
  const ranges = lineRanges(text, start, end);
  const edits: Edit[] = [];
  for (const r of ranges) {
    if (r.content.startsWith('- [ ] ')) {
      edits.push({ from: r.lineStart, to: r.lineStart + 6, insert: '- [x] ', selStart: start, selEnd: end });
    } else if (r.content.startsWith('- [x] ')) {
      edits.push({ from: r.lineStart, to: r.lineStart + 6, insert: '- [ ] ', selStart: start, selEnd: end });
    } else if (r.content.startsWith('- ')) {
      edits.push({ from: r.lineStart + 2, to: r.lineStart + 2, insert: '[ ] ', selStart: start + 4, selEnd: end + 4 });
    } else {
      edits.push({ from: r.lineStart, to: r.lineStart, insert: '- [ ] ', selStart: start + 6, selEnd: end + 6 });
    }
  }
  return edits;
}

/**
 * Toggle ordered-list prefix ('1. ') mirroring toggleLinePrefix.
 * Numbered detection accepts any `N. ` prefix; added lines get `1. `.
 */
export function toggleOrdered(text: string, start: number, end: number): Edit[] {
  const ranges = lineRanges(text, start, end);
  if (ranges.length === 0) return [];
  const orderedRe = /^\d+\.\s/;
  const allHave = ranges.every((r) => orderedRe.test(r.content));
  let shift = 0;
  return ranges.map((r) => {
    if (allHave) {
      const len = /^(\d+\.\s)/.exec(r.content)![1]!.length;
      const e: Edit = { from: r.lineStart, to: r.lineStart + len, insert: '', selStart: start + shift, selEnd: end + shift };
      shift -= len;
      return e;
    }
    if (orderedRe.test(r.content)) {
      return { from: r.lineStart, to: r.lineStart, insert: '', selStart: start + shift, selEnd: end + shift };
    }
    const e: Edit = {
      from: r.lineStart, to: r.lineStart, insert: '1. ',
      selStart: start + shift + 3, selEnd: end + shift + 3,
    };
    shift += 3;
    return e;
  });
}

/** Wrap intersected lines in a fenced block, or unwrap an exact fence. */
export function toggleFenceBlock(text: string, start: number, end: number): Edit[] {
  const ranges = lineRanges(text, start, end);
  if (ranges.length === 0) return [];
  const first = ranges[0]!;
  const last = ranges[ranges.length - 1]!;
  const wrapped = isFencedBlock(text, start, end);
  if (!wrapped) {
    return [{
      from: first.lineStart, to: last.lineEnd, insert: `\`\`\`\n${text.slice(first.lineStart, last.lineEnd)}\n\`\`\``,
      selStart: start + 4, selEnd: end + 4,
    }];
  }
  if (ranges.length === 1) {
    return [{ from: first.lineStart, to: first.lineEnd, insert: '', selStart: first.lineStart, selEnd: first.lineStart }];
  }
  const openerEnd = text[first.lineEnd] === '\n' ? first.lineEnd + 1 : first.lineEnd;
  const closerStart = last.lineStart > first.lineStart && text[last.lineStart - 1] === '\n'
    ? last.lineStart - 1
    : last.lineStart;
  const closerEnd = text[last.lineEnd] === '\n' ? last.lineEnd + 1 : last.lineEnd;
  if (openerEnd >= closerStart) {
    return [{ from: first.lineStart, to: closerEnd, insert: '', selStart: first.lineStart, selEnd: first.lineStart }];
  }
  return [
    { from: first.lineStart, to: openerEnd, insert: '', selStart: first.lineStart, selEnd: first.lineStart },
    { from: closerStart, to: closerEnd, insert: '', selStart: first.lineStart, selEnd: first.lineStart },
  ];
}

export const ALERT_KINDS = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

const ALERT_RE = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s?/;

/**
 * Toggle a GitHub alert (`> [!KIND]`) on intersected lines.
 * Same kind present → unwrap; different kind → switch; absent → wrap
 * (first line carries the marker, the rest plain quotes).
 */
export function toggleAlertBlock(text: string, start: number, end: number, kind: AlertKind): Edit[] {
  const ranges = lineRanges(text, start, end);
  if (ranges.length === 0) return [];
  const first = ranges[0]!;
  const existing = ALERT_RE.exec(first.content);
  if (existing) {
    if (existing[1] !== kind) {
      const at = first.content.indexOf('[!');
      const close = first.content.indexOf(']', at);
      return [{
        from: first.lineStart + at, to: first.lineStart + close + 1,
        insert: `[!${kind}]`, selStart: start, selEnd: end,
      }];
    }
    let shift = 0;
    return ranges.map((r, i) => {
      const len = i === 0 ? existing[0].length : (r.content.startsWith('> ') ? 2 : 0);
      const e: Edit = {
        from: r.lineStart, to: r.lineStart + len, insert: '',
        selStart: start + shift, selEnd: end + shift,
      };
      shift -= len;
      return e;
    });
  }
  let shift = 0;
  return ranges.map((r, i) => {
    const marker = i === 0 ? `> [!${kind}] ` : '> ';
    const replaceQuote = i === 0 && r.content.startsWith('> ');
    const e: Edit = {
      from: r.lineStart, to: r.lineStart + (replaceQuote ? 2 : 0), insert: marker,
      selStart: start + shift + (i === 0 ? marker.length : 0),
      selEnd: end + shift + marker.length,
    };
    shift += marker.length - (replaceQuote ? 2 : 0);
    return e;
  });
}

/** True when every intersected line starts with `prefix`. */
export function isLinePrefixed(text: string, start: number, end: number, prefix: string): boolean {
  const ranges = lineRanges(text, start, end);
  return ranges.length > 0 && ranges.every((r) => r.content.startsWith(prefix));
}

/** True when every intersected line is a task-list item. */
export function isTaskLines(text: string, start: number, end: number): boolean {
  const ranges = lineRanges(text, start, end);
  return ranges.length > 0 && ranges.every((r) => /^- \[[ xX]\] /.test(r.content));
}

/** True when every intersected line starts with a numbered-list marker. */
export function isNumberedLines(text: string, start: number, end: number): boolean {
  const ranges = lineRanges(text, start, end);
  return ranges.length > 0 && ranges.every((r) => /^\d+\.\s/.test(r.content));
}

/** True when the selection covers an exact fenced block. */
export function isFencedBlock(text: string, start: number, end: number): boolean {
  const ranges = lineRanges(text, start, end);
  if (ranges.length === 0) return false;
  const first = ranges[0]!;
  const last = ranges[ranges.length - 1]!;
  if (!first.content.startsWith('```')) return false;
  return ranges.length === 1
    ? /^\s*```\S*\s*$/.test(first.content)
    : /^\s*```\s*$/.test(last.content);
}

/** True when the first intersected line starts a GitHub alert. */
export function isAlertBlock(text: string, start: number, end: number, kind?: AlertKind): boolean {
  const ranges = lineRanges(text, start, end);
  const match = ranges[0] ? ALERT_RE.exec(ranges[0].content) : null;
  return match !== null && (kind === undefined || match[1] === kind);
}

/** True when [start, end) is wrapped in exactly `marker` (for active states). */
export function isWrapped(text: string, start: number, end: number, marker: string): boolean {
  if (start === end) return false;
  const b0 = start - marker.length;
  const a1 = end + marker.length;
  if (b0 < 0 || a1 > text.length) return false;
  if (text.slice(b0, start) !== marker || text.slice(end, a1) !== marker) return false;
  // The adjacent run must be exactly `marker` long (so `*` doesn't match `**`).
  const beforeChar = b0 > 0 ? text[b0 - 1] : '';
  const afterChar = a1 < text.length ? text[a1] : '';
  return beforeChar !== marker[0] && afterChar !== marker[marker.length - 1];
}

/** Wrap selection as [text](url), selecting the url placeholder. */
export function insertLink(text: string, start: number, end: number): Edit {
  if (start === end) {
    const insert = '[](url)';
    return { from: start, to: end, insert, selStart: start + 3, selEnd: start + 6 };
  }
  const mid = text.slice(start, end);
  const insert = `[${mid}](url)`;
  return {
    from: start, to: end, insert,
    selStart: start + mid.length + 3, selEnd: start + mid.length + 6,
  };
}
