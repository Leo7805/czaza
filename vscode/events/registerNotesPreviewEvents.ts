/**
 * Registers VS Code editor events that keep the notes preview synchronized.
 */

import * as vscode from "vscode";

import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";

/**
 * Follows active text editors and resource-backed editor tabs.
 *
 * Text editors provide the active source line. Custom tabs such as image
 * previews provide a resource URI without creating a TextEditor.
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

  const followResource = (uri: vscode.Uri | undefined, activeLine?: number): void => {
    if (!uri || uri.scheme !== "file") {
      return;
    }

    const previewLocation =
      activeLine === undefined
        ? `${uri.toString()}:resource`
        : `${uri.toString()}:line:${activeLine}`;

    if (previewLocation === lastPreviewLocation) {
      return;
    }

    lastPreviewLocation = previewLocation;

    void provider.showActiveDocumentNotes(uri, activeLine).catch((error: unknown) => {
      if (lastPreviewLocation === previewLocation) {
        lastPreviewLocation = undefined;
      }

      console.error("Failed to update CZaza notes preview for the active resource.", error);
    });
  };

  const followEditor = (editor: vscode.TextEditor | undefined): void => {
    followResource(editor?.document.uri, editor ? editor.selection.active.line + 1 : undefined);
  };

  const followActiveTab = (): void => {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    const uri = getTabResourceUri(tab);
    const editor = vscode.window.activeTextEditor;

    if (editor && uri && editor.document.uri.toString() === uri.toString()) {
      followEditor(editor);
      return;
    }

    followResource(uri);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(followEditor),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor === vscode.window.activeTextEditor) {
        void provider.syncRelocateTargetFromEditor?.(event.textEditor);
        followEditor(event.textEditor);
      }
    }),
    vscode.window.tabGroups.onDidChangeTabs(followActiveTab),
    vscode.window.tabGroups.onDidChangeTabGroups(followActiveTab),
  );

  if (vscode.window.activeTextEditor) {
    followEditor(vscode.window.activeTextEditor);
  } else {
    followActiveTab();
  }
}

function getTabResourceUri(tab: vscode.Tab | undefined): vscode.Uri | undefined {
  const input = tab?.input;

  if (
    input instanceof vscode.TabInputText ||
    input instanceof vscode.TabInputCustom ||
    input instanceof vscode.TabInputNotebook
  ) {
    return input.uri;
  }

  if (input instanceof vscode.TabInputTextDiff || input instanceof vscode.TabInputNotebookDiff) {
    return input.modified;
  }

  return undefined;
}
