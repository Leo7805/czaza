/**
 * Registers VS Code editor events that keep the notes preview synchronized.
 */

import * as vscode from "vscode";

import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";

/**
 * Follows text editors directly and uses tabs only for non-text resources.
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
  /** Loads Notes from the authoritative active text editor state. */
  const followEditor = (editor: vscode.TextEditor | undefined): void => {
    const uri = editor?.document.uri;
    if (!uri || uri.scheme !== "file") return;

    void provider.showActiveDocumentNotes(uri, editor.selection.active.line + 1).catch(
      (error: unknown) => {
        console.error("Failed to update CZaza notes preview for the active editor.", error);
      },
    );
  };

  /** Loads a non-text tab only when no text editor is currently active. */
  const followNonTextTab = (): void => {
    if (vscode.window.activeTextEditor) return;
    const uri = getNonTextTabResourceUri(vscode.window.tabGroups.activeTabGroup.activeTab);
    if (!uri || uri.scheme !== "file") return;

    void provider.showActiveDocumentNotes(uri).catch((error: unknown) => {
      console.error("Failed to update CZaza notes preview for the active non-text tab.", error);
    });
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) followEditor(editor);
      else followNonTextTab();
    }),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor !== vscode.window.activeTextEditor) return;
      void provider.syncRelocateTargetFromEditor?.(event.textEditor);
      void provider.showActiveDocumentLineNotes(
        event.textEditor.document.uri,
        event.textEditor.selection.active.line + 1,
      ).catch((error: unknown) => {
        console.error("Failed to update CZaza Line and Section Notes.", error);
      });
    }),
    vscode.window.tabGroups.onDidChangeTabs(followNonTextTab),
    vscode.window.tabGroups.onDidChangeTabGroups(followNonTextTab),
  );

  if (vscode.window.activeTextEditor) followEditor(vscode.window.activeTextEditor);
  else followNonTextTab();
}

/** Returns a URI only for supported tabs without a normal text editor. */
function getNonTextTabResourceUri(tab: vscode.Tab | undefined): vscode.Uri | undefined {
  const input = tab?.input;
  if (input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputNotebook) {
    return input.uri;
  }
  if (input instanceof vscode.TabInputNotebookDiff) return input.modified;
  return undefined;
}
