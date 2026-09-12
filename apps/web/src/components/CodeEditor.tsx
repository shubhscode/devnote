import { useEffect, useLayoutEffect, useRef } from 'react';
import { createEditorState, mountEditor, type EditorView } from '@devnote/editor';
import type { MutableRefObject } from 'react';

interface Props {
  /** Note id this doc belongs to. Changing it swaps the doc, no remount. */
  docKey: string;
  /** Committed doc for docKey. Typing flows upward via onDocChange; this prop only resets on docKey change. */
  initialDoc: string;
  /** External same-note writes (template apply, revision restore) with a sequence guard. */
  external?: { seq: number; body: string } | null;
  dark: boolean;
  fontSize: number;
  wrap: boolean;
  onDocChange: (doc: string) => void;
  viewRef: MutableRefObject<EditorView | null>;
  /** Fired once the view is mounted (lets parents attach listeners). */
  onReady?: () => void;
  /** Fired when the selection moves (bubble menu positioning). */
  onSelectionChange?: () => void;
}

/**
 * CodeMirror 6 host. Mounts once; note switches swap state via setState in a
 * layout effect (no remount, no paint flash, undo history resets per note).
 * See packages/editor.
 */
export default function CodeEditor(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<{ view: EditorView; setPrefs: (p: { dark: boolean; fontSize: number; wrap: boolean }) => void } | null>(null);
  const cbRef = useRef(props.onDocChange);
  cbRef.current = props.onDocChange;
  const selRef = useRef(props.onSelectionChange);
  selRef.current = props.onSelectionChange;
  const keyRef = useRef(props.docKey);
  const prefsRef = useRef({ dark: props.dark, fontSize: props.fontSize, wrap: props.wrap });
  prefsRef.current = { dark: props.dark, fontSize: props.fontSize, wrap: props.wrap };

  useEffect(() => {
    if (hostRef.current === null) return;
    const p = prefsRef.current;
    const handle = mountEditor({
      parent: hostRef.current,
      doc: props.initialDoc,
      dark: p.dark,
      fontSize: p.fontSize,
      wrap: p.wrap,
      onDocChange: (d) => cbRef.current(d),
      onSelection: () => selRef.current?.(),
    });
    keyRef.current = props.docKey;
    handleRef.current = handle;
    props.viewRef.current = handle.view;
    props.onReady?.();
    return () => {
      props.viewRef.current = null;
      handle.view.destroy();
      handleRef.current = null;
    };
    // Mount-once by design; doc swaps + prefs handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap doc on note switch (layout effect = before paint, no stale flash).
  // Committed-doc updates for the SAME note are skipped: the view already has them.
  useLayoutEffect(() => {
    const handle = handleRef.current;
    if (handle === null || keyRef.current === props.docKey) return;
    keyRef.current = props.docKey;
    const p = prefsRef.current;
    handle.view.setState(
      createEditorState(props.initialDoc, p.dark, { fontSize: p.fontSize, wrap: p.wrap }),
    );
  }, [props.docKey, props.initialDoc]);

  // External same-note writes (template/restore): dispatched as one undoable change.
  const appliedExternal = useRef(0);
  useLayoutEffect(() => {
    const handle = handleRef.current;
    const ext = props.external;
    if (handle === null || !ext || ext.seq === appliedExternal.current) return;
    appliedExternal.current = ext.seq;
    const cur = handle.view.state.doc.toString();
    if (cur !== ext.body) {
      handle.view.dispatch({ changes: { from: 0, to: cur.length, insert: ext.body } });
    }
  });

  useEffect(() => {
    handleRef.current?.setPrefs({ dark: props.dark, fontSize: props.fontSize, wrap: props.wrap });
  }, [props.dark, props.fontSize, props.wrap]);

  return <div ref={hostRef} className="h-full" data-doc-key={props.docKey} />;
}
