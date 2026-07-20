/** Pure text operations shared by controlled webview editors. */

export type EditorSelection = { start: number; end: number };

export function replaceEditorSelection(
  value: string,
  selection: EditorSelection,
  insertedText: string,
): string {
  return `${value.slice(0, selection.start)}${insertedText}${value.slice(selection.end)}`;
}
