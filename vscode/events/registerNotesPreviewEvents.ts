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
  let lastSuccessfulLocation: string | undefined;
  let refreshScheduled = false;
  let refreshRevision = 0;

  /** Resolves the latest stable editor or Preview Tab state after event ordering settles. */
  const getActiveResource = (): { uri: vscode.Uri; activeLine?: number; key: string } | undefined => {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    const tabUri = getTabResourceUri(tab);
    const editor = vscode.window.activeTextEditor;
    const editorUri = editor?.document.uri;
    if (tab && !tabUri) return undefined;
    const uri = tabUri ?? editorUri;

    if (!uri || uri.scheme !== "file") return undefined;

    const activeLine = editor && editorUri?.toString() === uri.toString()
      ? editor.selection.active.line + 1
      : undefined;
    const key = activeLine === undefined
      ? `${uri.toString()}:resource`
      : `${uri.toString()}:line:${activeLine}`;
    return { uri, ...(activeLine ? { activeLine } : {}), key };
  };

  /** Coalesces related editor and tab events before loading only the latest resource. */
  const scheduleActiveResourceRefresh = (): void => {
    refreshRevision += 1;
    if (refreshScheduled) return;
    refreshScheduled = true;

    queueMicrotask(() => {
      refreshScheduled = false;
      const revision = refreshRevision;
      const target = getActiveResource();
      if (!target || target.key === lastSuccessfulLocation) return;

      void provider.showActiveDocumentNotes(target.uri, target.activeLine)
        .then(() => {
          if (revision === refreshRevision) lastSuccessfulLocation = target.key;
        })
        .catch((error: unknown) => {
          console.error("Failed to update CZaza notes preview for the active resource.", error);
        });
    });
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(scheduleActiveResourceRefresh),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor === vscode.window.activeTextEditor) {
        void provider.syncRelocateTargetFromEditor?.(event.textEditor);
        scheduleActiveResourceRefresh();
      }
    }),
    vscode.window.tabGroups.onDidChangeTabs(scheduleActiveResourceRefresh),
    vscode.window.tabGroups.onDidChangeTabGroups(scheduleActiveResourceRefresh),
  );

  scheduleActiveResourceRefresh();
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
