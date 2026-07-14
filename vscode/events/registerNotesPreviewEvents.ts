/**
 * Registers VS Code editor events that keep the notes preview synchronized.
 */

import * as vscode from "vscode";

import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";

/**
 * Follows the active text editor and refreshes notes for file documents.
 *
 * Explorer directory selections do not produce active text editors, so
 * directory previews remain an explicit Show Notes action.
 *
 * @param context - Current VS Code extension context.
 * @param provider - Notes provider that loads and displays file previews.
 *
 * @example
 * registerNotesPreviewEvents(context, notesProvider);
 */
export function registerNotesPreviewEvents(
  context: vscode.ExtensionContext,
  provider: NotesViewProvider,
): void {
  let lastPreviewLocation: string | undefined;

  const followEditor = (editor: vscode.TextEditor | undefined): void => {
    const uri = editor?.document.uri;

    if (!uri || uri.scheme !== "file") {
      lastPreviewLocation = undefined;
      return;
    }

    const activeLine = editor.selection.active.line + 1;
    const previewLocation = `${uri.toString()}:${activeLine}`;

    if (previewLocation === lastPreviewLocation) {
      return;
    }

    lastPreviewLocation = previewLocation;

    void provider.showActiveDocumentNotes(uri, activeLine).catch((error: unknown) => {
      if (lastPreviewLocation === previewLocation) {
        lastPreviewLocation = undefined;
      }

      console.error("Failed to update CZaza notes preview for the active file.", error);
    });
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(followEditor),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor === vscode.window.activeTextEditor) {
        followEditor(event.textEditor);
      }
    }),
  );

  followEditor(vscode.window.activeTextEditor);
}
