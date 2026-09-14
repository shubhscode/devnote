// Markdown lint (2.5): quiet warnings for sloppy whitespace + unclosed
// fences. Pure line scan (no crashes on weird input); view.ts exposes it
// through @codemirror/lint. Severity stays 'warning' — never errors.
export interface LintHit {
  from: number;
  to: number;
  message: string;
}

export function markdownLint(doc: string): LintHit[] {
  const hits: LintHit[] = [];
  let offset = 0;
  let fenceAt: number | null = null;
  let blanks = 0;
  for (const line of doc.split('\n')) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('```')) {
      fenceAt = fenceAt === null ? offset : null;
      blanks = 0;
    } else if (fenceAt === null) {
      if (/[ \t]+$/.test(line)) {
        hits.push({ from: offset + line.length - line.match(/[ \t]+$/)![0].length, to: offset + line.length, message: 'Trailing whitespace' });
      }
      if (line.trim() === '') {
        blanks += 1;
        if (blanks > 1) hits.push({ from: offset, to: offset + line.length, message: 'Multiple blank lines' });
      } else {
        blanks = 0;
      }
    }
    offset += line.length + 1;
  }
  if (fenceAt !== null) {
    hits.push({ from: fenceAt, to: fenceAt + 3, message: 'Unclosed fenced code block' });
  }
  return hits;
}
