// Excalidraw render pass (2.14): finds div.excalidraw-block placeholders
// (fenced ```excalidraw JSON) and swaps in an SVG exported by
// exportToSvg. The heavy excalidraw chunk loads on first block only
// (bundle-diet guard, mirrors lib/mermaid.ts). No server, offline.
// exportToSvg output is pre-sanitized (own whitelist), same trust level
// as the mermaid `securityLevel: 'strict'` render.
let loading: Promise<typeof import('@excalidraw/excalidraw')> | null = null;

function loadExcalidraw() {
  loading ??= import('@excalidraw/excalidraw');
  return loading;
}

/** Parse the fence source; throws a readable error for bad JSON. */
function parseElements(src: string) {
  const doc = JSON.parse(src) as {
    elements?: unknown;
    appState?: Record<string, unknown>;
  };
  const elements = doc.elements;
  if (!Array.isArray(elements) || elements.length === 0) {
    throw new Error('no elements in excalidraw document');
  }
  return {
    // Old exports may lack lazers-era fields; excalidraw restores coarse
    // snapshots fine. Cast through unknown once, at this single point.
    elements,
    appState: {
      viewBackgroundColor: 'transparent',
      exportBackground: false,
      exportWithDarkMode: false,
      ...(doc.appState ?? {}),
    },
  };
}

/** Render an excalidraw JSON fence to an inline SVG string (lazy chunk). */
export async function renderExcalidraw(src: string): Promise<string> {
  try {
    const { exportToSvg } = await loadExcalidraw();
    const { elements, appState } = parseElements(src);
    const svg = await exportToSvg({
      // data-model cast: restore() normalizes missing fields below.
      elements: elements as Parameters<typeof exportToSvg>[0]['elements'],
      appState: appState as Parameters<typeof exportToSvg>[0]['appState'],
      files: null,
    });
    svg.removeAttribute('style');
    return svg.outerHTML;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`invalid excalidraw JSON: ${err.message}`);
    }
    throw err;
  }
}
