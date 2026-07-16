/**
 * Registers notes-related VS Code UI surfaces.
 */

import * as vscode from "vscode";

import { NotesViewProvider } from "./NotesViewProvider";

export const NOTES_VIEW_ID = "czaza.notesView";
const SHOW_NOTES_COMMAND = "czaza.showNotes";
const SHOW_NOTES_NAVIGATOR_COMMAND = "czaza.showNotesNavigator";
const SHOW_NOTES_DETAIL_COMMAND = "czaza.showNotesDetail";
const NOTES_VIEW_MODE_CONTEXT = "czaza.notesViewMode";
type NotesViewMode = "detail" | "navigator";

/**
 * Registers the notes webview and Show Notes command.
 *
 * @param context - Current VS Code extension context.
 * @param provider - Webview provider that renders resource notes.
 *
 * @example
 * registerNotesUi(context, provider);
 */
export function registerNotesUi(
  context: vscode.ExtensionContext,
  provider: NotesViewProvider,
): void {
  let viewMode: NotesViewMode = "detail";
  void vscode.commands.executeCommand("setContext", NOTES_VIEW_MODE_CONTEXT, viewMode);

  const setViewMode = async (mode: NotesViewMode): Promise<void> => {
    viewMode = mode;
    await vscode.commands.executeCommand("setContext", NOTES_VIEW_MODE_CONTEXT, mode);
    provider.postViewMode(mode);
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(NOTES_VIEW_ID, provider),
    vscode.commands.registerCommand(SHOW_NOTES_COMMAND, async (uri?: vscode.Uri) => {
      await vscode.commands.executeCommand(`${NOTES_VIEW_ID}.focus`);
      await provider.showResourceNotes(uri);
    }),
    vscode.commands.registerCommand(SHOW_NOTES_NAVIGATOR_COMMAND, () => setViewMode("navigator")),
    vscode.commands.registerCommand(SHOW_NOTES_DETAIL_COMMAND, () => setViewMode("detail")),
  );
}
