// Markdown table assistance (GFM): continue rows on Enter, Tab/Shift-Tab
// cell navigation, and pipe autoformatting. Pure string ops — the CodeMirror
// adapters in view.ts convert TableEdit to dispatches. Escaped pipes (\|)
// never split cells.

/** Offsets of unescaped `|` in a line. */
export function pipePositions(line: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\') {
      i += 1; // skip escaped char
      continue;
    }
    if (line[i] === '|') out.push(i);
  }
  return out;
}

/** Cell contents between the outer pipes, trimmed. Empty list when no pipes. */
export function splitRow(line: string): string[] {
  const pipes = pipePositions(line);
  if (pipes.length < 2) return [];
  const cells: string[] = [];
  for (let i = 0; i + 1 < pipes.length; i++) {
    cells.push(line.slice(pipes[i]! + 1, pipes[i + 1]!).trim());
  }
  return cells;
}

export function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line) && splitRow(line).length > 0;
}

function isDelimiterCells(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

export function isDelimiterRow(line: string): boolean {
  return isTableRow(line) && isDelimiterCells(splitRow(line));
}

/** Contiguous table-row block containing lineNo. */
export function tableBlock(lines: string[], lineNo: number): { start: number; end: number } {
  let start = lineNo;
  while (start > 0 && isTableRow(lines[start - 1] ?? '')) start -= 1;
  let end = lineNo;
  while (end + 1 < lines.length && isTableRow(lines[end + 1] ?? '')) end += 1;
  return { start, end };
}

type Align = 'left' | 'center' | 'right';

function columnAlign(rows: string[][], col: number): Align {
  const delim = rows.find((r) => isDelimiterCells(r));
  const cell = delim?.[col] ?? '';
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  return 'left';
}

function padCell(text: string, width: number, align: Align): string {
  if (align === 'right') return text.padStart(width);
  if (align === 'center') {
    const total = Math.max(0, width - text.length);
    const left = Math.floor(total / 2);
    return ' '.repeat(left) + text + ' '.repeat(total - left);
  }
  return text.padEnd(width);
}

function delimiterCell(raw: string, width: number, align: Align): string {
  const dashes = '-'.repeat(Math.max(3, width));
  const left = raw.startsWith(':');
  const right = raw.endsWith(':');
  if (left && right) return `:${dashes.slice(0, Math.max(1, dashes.length - 2))}:`;
  if (right) return `${dashes.slice(0, Math.max(1, dashes.length - 1))}:`;
  if (left) return `:${dashes.slice(0, Math.max(1, dashes.length - 1))}`;
  return dashes;
}

/** Pretty-print block lines: aligned pipes, padded cells, normalized delimiters. */
export function formatBlock(block: string[]): string[] {
  const rows = block.map(splitRow);
  const n = Math.max(...rows.map((r) => r.length));
  for (const r of rows) while (r.length < n) r.push('');
  const widths = Array.from({ length: n }, (_, i) =>
    Math.max(3, ...rows.map((r) => (isDelimiterCells(r) ? 0 : (r[i] ?? '').length))),
  );
  return rows.map((r) => {
    if (isDelimiterCells(r)) {
      return `| ${r.map((c, i) => delimiterCell(c, widths[i]!, columnAlign(rows, i))).join(' | ')} |`;
    }
    return `| ${r.map((c, i) => padCell(c, widths[i]!, columnAlign(rows, i))).join(' | ')} |`;
  });
}

export function emptyRow(n: number): string {
  return `|${'   |'.repeat(Math.max(1, n))}`;
}

export interface TableEdit {
  startLine: number;
  endLine: number;
  newLines: string[];
  cursorLine: number;
  cursorCh: number;
}

/** Cell index containing column ch (clamped to a valid cell). */
function cellIndexAt(line: string, ch: number): number {
  const pipes = pipePositions(line);
  const n = Math.max(0, pipes.length - 1);
  if (n === 0) return 0;
  let count = 0;
  for (const p of pipes) {
    if (p < ch) count += 1;
    else break;
  }
  const idx = count - 1;
  if (idx < 0) return 0;
  if (idx >= n) return n - 1;
  return idx;
}

/** Content start (after `| `) of cell i in a formatted line. */
function cellStart(line: string, i: number): number {
  const pipes = pipePositions(line);
  return (pipes[i] ?? 0) + 2;
}

/**
 * Enter on a table row: append an empty row below (same width) and format.
 * On an empty body row, remove it instead (exit the table).
 * Requires a delimiter row somewhere in the block — otherwise this is not a
 * table yet and Enter stays a plain newline (so users can type the delimiter).
 */
export function continueTableRow(lines: string[], lineNo: number): TableEdit | null {
  const line = lines[lineNo];
  if (line === undefined || !isTableRow(line)) return null;
  const { start, end } = tableBlock(lines, lineNo);
  if (!lines.slice(start, end + 1).some(isDelimiterRow)) return null;
  const cells = splitRow(line);
  if (!isDelimiterRow(line) && cells.every((c) => c === '')) {
    return { startLine: lineNo, endLine: lineNo, newLines: [''], cursorLine: lineNo, cursorCh: 0 };
  }
  const formatted = formatBlock(lines.slice(start, end + 1));
  const width = Math.max(splitRow(formatted[0] ?? '').length, 1);
  const at = lineNo - start + 1; // insert after the current row
  formatted.splice(at, 0, emptyRow(width));
  return { startLine: start, endLine: end, newLines: formatted, cursorLine: start + at, cursorCh: 2 };
}

/**
 * Tab/Shift-Tab cell navigation (dir +1/-1). Formats the block, jumps to the
 * next cell, appends a row past the last cell. Null when not in a table (or
 * Shift-Tab with no table row above) so the key falls through to indent.
 */
export function advanceCell(lines: string[], lineNo: number, ch: number, dir: 1 | -1): TableEdit | null {
  const line = lines[lineNo];
  if (line === undefined || !isTableRow(line)) return null;
  const n = Math.max(splitRow(line).length, 1);
  const idx = cellIndexAt(line, ch);
  const target = idx + dir;
  const { start, end } = tableBlock(lines, lineNo);

  if (target >= 0 && target < n) {
    const formatted = formatBlock(lines.slice(start, end + 1));
    const rowLine = start + (lineNo - start);
    return {
      startLine: start, endLine: end, newLines: formatted,
      cursorLine: rowLine, cursorCh: cellStart(formatted[rowLine - start]!, target),
    };
  }
  if (dir === 1 && target >= n) {
    const formatted = formatBlock(lines.slice(start, end + 1));
    const at = lineNo - start + 1;
    formatted.splice(at, 0, emptyRow(n));
    return {
      startLine: start, endLine: end, newLines: formatted,
      cursorLine: start + at, cursorCh: 2,
    };
  }
  // dir === -1 past the first cell: previous row's last cell, if it's a table row.
  if (lineNo > start) {
    const formatted = formatBlock(lines.slice(start, end + 1));
    const rowLine = lineNo - 1;
    const rowCells = Math.max(splitRow(formatted[rowLine - start]!).length, 1);
    return {
      startLine: start, endLine: end, newLines: formatted,
      cursorLine: rowLine, cursorCh: cellStart(formatted[rowLine - start]!, rowCells - 1),
    };
  }
  return null;
}
