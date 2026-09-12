import { describe, expect, it } from 'vitest';
import {
  advanceCell,
  continueTableRow,
  emptyRow,
  formatBlock,
  isDelimiterRow,
  isTableRow,
  pipePositions,
  splitRow,
} from './table';

function apply(lines: string[], edit: { startLine: number; endLine: number; newLines: string[] }): string[] {
  return [...lines.slice(0, edit.startLine), ...edit.newLines, ...lines.slice(edit.endLine + 1)];
}

describe('row parsing', () => {
  it('splits on unescaped pipes only', () => {
    expect(splitRow('| a | b |')).toEqual(['a', 'b']);
    expect(splitRow('| a \\| b | c |')).toEqual(['a \\| b', 'c']);
    expect(splitRow('not a row')).toEqual([]);
  });

  it('detects table and delimiter rows', () => {
    expect(isTableRow('| a | b |')).toBe(true);
    expect(isTableRow('| a |')).toBe(true);
    expect(isTableRow('plain')).toBe(false);
    expect(isTableRow('| no close')).toBe(false);
    expect(isDelimiterRow('| --- | --- |')).toBe(true);
    expect(isDelimiterRow('| :--- | ---: |')).toBe(true);
    expect(isDelimiterRow('| a | b |')).toBe(false);
  });

  it('finds pipe positions', () => {
    expect(pipePositions('| a | b |')).toEqual([0, 4, 8]);
  });

  it('builds empty rows', () => {
    expect(emptyRow(2)).toBe('|   |   |');
  });
});

describe('formatBlock', () => {
  it('aligns ragged pipes', () => {
    expect(formatBlock(['|a|b|', '|---|---|', '|longer cell|x|'])).toEqual([
      '| a           | b   |',
      '| ----------- | --- |',
      '| longer cell | x   |',
    ]);
  });

  it('keeps alignment markers', () => {
    expect(formatBlock(['|a|b|c|', '|:---|:---:|---:|'])).toEqual([
      '| a   |  b  |   c |',
      '| :-- | :-: | --: |',
    ]);
  });
});

describe('continueTableRow', () => {
  it('appends an empty row and formats', () => {
    const edit = continueTableRow(['|a|b|', '|---|---|'], 1)!;
    expect(apply(['|a|b|', '|---|---|'], edit)).toEqual([
      '| a   | b   |',
      '| --- | --- |',
      '|   |   |',
    ]);
    expect({ line: edit.cursorLine, ch: edit.cursorCh }).toEqual({ line: 2, ch: 2 });
  });

  it('removes an empty body row (exit table)', () => {
    const lines = ['| a |', '|---|---|', '|   |'];
    const edit = continueTableRow(lines, 2)!;
    expect(apply(lines, edit)).toEqual(['| a |', '|---|---|', '']);
    expect(edit.cursorCh).toBe(0);
  });

  it('stays a plain newline without a delimiter row yet', () => {
    expect(continueTableRow(['| a | b |'], 0)).toBeNull();
  });

  it('ignores non-table lines', () => {
    expect(continueTableRow(['plain'], 0)).toBeNull();
  });
});

describe('advanceCell', () => {
  const lines = ['| a   | b   |', '| --- | --- |', '| c   | d   |'];

  it('moves to the next cell', () => {
    const edit = advanceCell(lines, 0, 3, 1)!; // inside cell a
    expect(edit.cursorLine).toBe(0);
    expect(edit.cursorCh).toBe(8); // start of cell b
  });

  it('appends a row past the last cell', () => {
    const edit = advanceCell(lines, 2, 11, 1)!; // inside cell d
    const out = apply(lines, edit);
    expect(out).toHaveLength(4);
    expect(out[3]).toBe('|   |   |');
    expect({ line: edit.cursorLine, ch: edit.cursorCh }).toEqual({ line: 3, ch: 2 });
  });

  it('shift+tab goes to the previous row last cell', () => {
    const edit = advanceCell(lines, 2, 1, -1)!; // start of row 3
    expect(edit.cursorLine).toBe(1);
    expect(edit.cursorCh).toBe(8);
  });

  it('returns null outside tables', () => {
    expect(advanceCell(['plain'], 0, 2, 1)).toBeNull();
    expect(advanceCell(lines, 0, 1, -1)).toBeNull(); // first cell of block, shift+tab
  });
});
