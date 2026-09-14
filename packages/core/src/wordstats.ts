// Word stats for the editor status bar (2.3). Pure string scan — no remark
// dependency in core. Fenced code blocks are skipped (prose metric, not
// source metric); inline code counts as prose.

export interface WordStats {
  words: number;
  /** Unicode code-point count of the raw body. */
  chars: number;
  /** Ceiled minutes at 220 wpm. 0 for empty bodies (UI shows `<1 min`). */
  readingMinutes: number;
}

const WORDS_PER_MINUTE = 220;

function stripFencedBlocks(body: string): string {
  const out: string[] = [];
  let inFence = false;
  for (const line of body.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) out.push(line);
  }
  return out.join('\n');
}

export function wordStats(body: string): WordStats {
  const prose = stripFencedBlocks(body);
  const words = prose.match(/\S+/g)?.length ?? 0;
  return {
    words,
    chars: [...body].length,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)),
  };
}
