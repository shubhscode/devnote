// Rounded code-block boxes in the editor (preview parity).
// A ViewPlugin decorates every line spanned by a FencedCode node; theme CSS
// in view.ts paints the box (first/middle/last get different radii).
import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import type { EditorState, Extension } from '@codemirror/state';
import { Decoration, ViewPlugin, ViewUpdate, type DecorationSet } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';

export interface FencedBlock {
  fromLine: number;
  toLine: number;
}

/** 1-based line ranges spanned by fenced code blocks (via syntax tree, not regex). */
export function fencedCodeLineRanges(state: EditorState): FencedBlock[] {
  const ranges: FencedBlock[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.node.name !== 'FencedCode') return;
      ranges.push({
        fromLine: state.doc.lineAt(node.from).number,
        toLine: state.doc.lineAt(node.to).number,
      });
    },
  });
  return ranges;
}

function lineClass(fromLine: number, toLine: number, line: number): string {
  if (fromLine === toLine) return 'cm-codeblock cm-codeblock-single';
  if (line === fromLine) return 'cm-codeblock cm-codeblock-first';
  if (line === toLine) return 'cm-codeblock cm-codeblock-last';
  return 'cm-codeblock';
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const block of fencedCodeLineRanges(view.state)) {
    for (let ln = block.fromLine; ln <= block.toLine; ln++) {
      const line = view.state.doc.line(ln);
      builder.add(line.from, line.from, Decoration.line({ class: lineClass(block.fromLine, block.toLine, ln) }));
    }
  }
  return builder.finish();
}

/** Decorate fenced-code lines so the theme can paint a rounded box. */
export function codeBlockBox(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}
