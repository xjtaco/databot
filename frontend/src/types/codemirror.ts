/** Minimal view interface exposed by the vue-codemirror component for cursor-based insertion. */
export interface CmEditorView {
  state: { selection: { main: { head: number } }; doc: { toString(): string } };
  dispatch(spec: { changes: { from: number; insert: string } }): void;
}
