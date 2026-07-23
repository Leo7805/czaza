/**
 * Owns editor decorations for the selected Section Note and active Line Note.
 */

import * as vscode from "vscode";

import type {
  ResourceLineNoteContent,
  ResourceNotesResult,
} from "@vscode/services/getResourceNotesService";

export type NotesEditorHighlightState = {
  viewAvailable: boolean;
  resourceUri?: vscode.Uri;
  payload?: ResourceNotesResult;
  selectedSectionId?: string;
};

/**
 * Coordinates Section and Line Note decorations across VS Code text editors.
 *
 * The controller owns both decoration types, tracks the editors on which they
 * are applied, clears stale decorations when the resource changes, and releases
 * all decoration resources when disposed.
 *
 * @example
 * const controller = new NotesEditorHighlightController();
 * controller.update({
 *   viewAvailable: true,
 *   resourceUri: document.uri,
 *   payload,
 *   selectedSectionId,
 * });
 * controller.dispose();
 */
export class NotesEditorHighlightController implements vscode.Disposable {
  private sectionEditor?: vscode.TextEditor;
  private lineEditor?: vscode.TextEditor;
  private readonly sectionDecorationType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: "rgba(78, 161, 255, 0.10)",
  });
  private readonly lineDecorationType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: "rgba(255, 193, 7, 0.14)",
  });

  /**
   * Synchronizes Section and Line Note decorations with the current notes state.
   *
   * @param state - Current resource, notes payload, selection, and view availability.
   * @returns Nothing.
   *
   * @example
   * controller.update({ viewAvailable: true, resourceUri, payload, selectedSectionId });
   */
  update(state: NotesEditorHighlightState): void {
    const editor = state.resourceUri ? this.findEditor(state.resourceUri) : undefined;

    if (
      !state.viewAvailable ||
      !editor ||
      !state.resourceUri ||
      editor.document.uri.toString() !== state.resourceUri.toString()
    ) {
      this.clear();
      return;
    }

    this.updateSection(editor, state.payload, state.selectedSectionId);
    this.updateLine(editor, state.payload);
  }

  /**
   * Finds the active, visible, or previously decorated editor for a resource.
   *
   * @param resourceUri - Source resource whose editor should be located.
   * @returns The matching text editor, or undefined when the resource is not open.
   *
   * @example
   * const editor = controller.findEditor(document.uri);
   */
  findEditor(resourceUri: vscode.Uri): vscode.TextEditor | undefined {
    const resourceKey = resourceUri.toString();
    const candidates = [
      vscode.window.activeTextEditor,
      this.sectionEditor,
      this.lineEditor,
      ...(vscode.window.visibleTextEditors ?? []),
    ];

    return candidates.find((editor) => editor?.document.uri.toString() === resourceKey);
  }

  /**
   * Removes all Section and Line Note decorations from tracked editors.
   *
   * @returns Nothing.
   *
   * @example
   * controller.clear();
   */
  clear(): void {
    this.clearSection();
    this.clearLine();
  }

  /**
   * Clears active decorations and releases their VS Code decoration types.
   *
   * @returns Nothing.
   *
   * @example
   * controller.dispose();
   */
  dispose(): void {
    this.clear();
    this.sectionDecorationType.dispose();
    this.lineDecorationType.dispose();
  }

  /**
   * Applies the pale-blue decoration for the selected Section Note.
   *
   * @param editor - Editor containing the selected section.
   * @param payload - Current resource notes payload.
   * @param selectedSectionId - Stable identifier of the selected Section Note.
   * @returns Nothing.
   */
  private updateSection(
    editor: vscode.TextEditor,
    payload: ResourceNotesResult | undefined,
    selectedSectionId: string | undefined,
  ): void {
    const section =
      payload?.kind === "file"
        ? payload.sectionNotes.find((candidate) => candidate.id === selectedSectionId)
        : undefined;

    if (!section) {
      this.clearSection();
      return;
    }

    const startLine = Math.max(0, section.startLine - 1);
    const endLine = Math.min(editor.document.lineCount - 1, section.endLine - 1);

    if (startLine > endLine) {
      this.clearSection();
      return;
    }

    if (this.sectionEditor && this.sectionEditor !== editor) {
      this.sectionEditor.setDecorations(this.sectionDecorationType, []);
    }

    const range = new vscode.Range(
      startLine,
      0,
      endLine,
      editor.document.lineAt(endLine).text.length,
    );
    this.sectionEditor = editor;
    editor.setDecorations(this.sectionDecorationType, [range]);
  }

  /**
   * Applies the pale-yellow decoration for a content-bearing active Line Note.
   *
   * @param editor - Editor containing the active line.
   * @param payload - Current resource notes payload.
   * @returns Nothing.
   */
  private updateLine(editor: vscode.TextEditor, payload: ResourceNotesResult | undefined): void {
    const lineNote = payload?.kind === "file" ? payload.lineNote : undefined;

    if (
      !lineNote ||
      lineNote.status?.anchor === "orphaned" ||
      !hasVisibleLineNoteContent(lineNote) ||
      lineNote.line < 1 ||
      lineNote.line > editor.document.lineCount
    ) {
      this.clearLine();
      return;
    }

    if (this.lineEditor && this.lineEditor !== editor) {
      this.lineEditor.setDecorations(this.lineDecorationType, []);
    }

    const line = lineNote.line - 1;
    const range = new vscode.Range(line, 0, line, editor.document.lineAt(line).text.length);
    this.lineEditor = editor;
    editor.setDecorations(this.lineDecorationType, [range]);
  }

  /**
   * Removes the Section Note decoration and releases its tracked editor.
   *
   * @returns Nothing.
   */
  private clearSection(): void {
    this.sectionEditor?.setDecorations(this.sectionDecorationType, []);
    this.sectionEditor = undefined;
  }

  /**
   * Removes the Line Note decoration and releases its tracked editor.
   *
   * @returns Nothing.
   */
  private clearLine(): void {
    this.lineEditor?.setDecorations(this.lineDecorationType, []);
    this.lineEditor = undefined;
  }
}

/**
 * Checks whether a Line Note contains visible user-authored or AI-generated content.
 *
 * @param lineNote - Line Note content associated with the active source line.
 * @returns True when the note has a non-empty User Note or an AI explanation.
 */
function hasVisibleLineNoteContent(lineNote: ResourceLineNoteContent): boolean {
  return Boolean(lineNote.userNote?.trim() || lineNote.aiExplanation);
}
