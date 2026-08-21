/**
 * Registers notes-related VS Code UI surfaces.
 */

import * as vscode from "vscode";

import { resolveCzazaRootDirectory } from "@vscode/config/resolveCzazaRootDirectory";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import type { PersonalIdentityService, PersonalNoteScopeService } from "@vscode/personalNotes";

import { NotesViewProvider } from "./NotesViewProvider";

export const NOTES_VIEW_ID = "czaza.notesView";
const SHOW_NOTES_COMMAND = "czaza.showNotes";
const SHOW_PROJECT_NOTES_COMMAND = "czaza.showProjectNotes";
const SHOW_TEAM_NOTES_COMMAND = "czaza.showTeamNotes";
const SHOW_PERSONAL_NOTES_COMMAND = "czaza.showPersonalNotes";
const OPEN_NOTES_SPACE_MENU_COMMAND = "czaza.openNotesSpaceMenu";
const SHOW_NOTES_NAVIGATOR_COMMAND = "czaza.showNotesNavigator";
const SHOW_NOTES_DETAIL_COMMAND = "czaza.showNotesDetail";
const INSERT_EMOJI_COMMAND = "czaza.insertEmoji";
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
  noteScope: PersonalNoteScopeService,
  identities: PersonalIdentityService,
): void {
  let viewMode: NotesViewMode = "detail";
  void vscode.commands.executeCommand("setContext", NOTES_VIEW_MODE_CONTEXT, viewMode);

  const setViewMode = async (mode: NotesViewMode): Promise<void> => {
    viewMode = mode;
    await vscode.commands.executeCommand("setContext", NOTES_VIEW_MODE_CONTEXT, mode);

    if (mode === "detail") {
      await provider.showResourceNotes();
      return;
    }

    provider.postViewMode(mode);
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(NOTES_VIEW_ID, provider),
    vscode.commands.registerCommand(SHOW_NOTES_COMMAND, async (uri?: vscode.Uri) => {
      if (uri && uri.scheme !== "file") {
        void vscode.window.showWarningMessage(
          "CZaza: Notes are only supported for local file-system workspaces.",
        );
        return;
      }

      await vscode.commands.executeCommand(`${NOTES_VIEW_ID}.focus`);
      await provider.showResourceNotes(uri);
    }),
    vscode.commands.registerCommand(SHOW_PROJECT_NOTES_COMMAND, async () => {
      const workspaceFolder = await selectWorkspaceFolder();

      if (!workspaceFolder) {
        return;
      }

      try {
        const { rootDirectory } = resolveCzazaRootDirectory(workspaceFolder.uri);
        await vscode.commands.executeCommand(`${NOTES_VIEW_ID}.focus`);
        await provider.showResourceNotes(vscode.Uri.file(rootDirectory));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown root directory error.";
        void vscode.window.showWarningMessage(`CZaza: ${message}`);
      }
    }),
    vscode.commands.registerCommand(OPEN_NOTES_SPACE_MENU_COMMAND, async () => {
      await vscode.commands.executeCommand(`${NOTES_VIEW_ID}.focus`);
      await provider.openNotesSpaceMenu();
    }),
    vscode.commands.registerCommand(SHOW_TEAM_NOTES_COMMAND, async () => {
      const resource = vscode.window.activeTextEditor?.document.uri;
      try {
        const { rootDirectory } = resolveCzazaRootDirectory(resource);
        await noteScope.setScope(rootDirectory, "team");
        await provider.refreshCurrentResourceNotes();
        void vscode.window.showInformationMessage("CZaza Notes switched to Team.");
      } catch (error) {
        void vscode.window.showWarningMessage(`CZaza: ${getErrorMessage(error)}`);
      }
    }),
    vscode.commands.registerCommand(SHOW_PERSONAL_NOTES_COMMAND, async () => {
      const resource = vscode.window.activeTextEditor?.document.uri;
      try {
        const { rootDirectory } = resolveCzazaRootDirectory(resource);
        const { outputDirectory } = getCzazaSettings(resource);
        const confirmed = await vscode.commands.executeCommand<boolean>(
          "czaza.selectPersonalIdentity",
        );
        if (!confirmed) return;
        const identity = await identities.getCurrentIdentity(rootDirectory, outputDirectory);
        if (!identity) return;
        await noteScope.setScope(rootDirectory, "personal");
        await provider.refreshCurrentResourceNotes();
        void vscode.window.showInformationMessage(
          `CZaza Notes switched to Personal: ${identity.displayName}.`,
        );
      } catch (error) {
        void vscode.window.showWarningMessage(`CZaza: ${getErrorMessage(error)}`);
      }
    }),
    vscode.commands.registerCommand(SHOW_NOTES_NAVIGATOR_COMMAND, () => setViewMode("navigator")),
    vscode.commands.registerCommand(SHOW_NOTES_DETAIL_COMMAND, () => setViewMode("detail")),
    vscode.commands.registerCommand(INSERT_EMOJI_COMMAND, () => provider.openEmojiPicker()),
  );
}

/** Converts an unknown command error into readable text. */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}

async function selectWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders?.length) {
    void vscode.window.showWarningMessage("CZaza: Open a workspace folder to view project notes.");
    return undefined;
  }

  if (workspaceFolders.length === 1) {
    return workspaceFolders[0];
  }

  return vscode.window.showWorkspaceFolderPick({
    placeHolder: "Select the workspace whose CZaza project notes you want to view",
  });
}
