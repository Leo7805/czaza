/**
 * Implements the VS Code command for copying a selected file's Git diff.
 */

import path from "node:path";

import * as vscode from "vscode";

import { getFileDiff } from "@vscode/copyForAI/getFileDiff";

/**
 * Finds an open text document that represents the selected local file.
 *
 * @param targetUri - The URI of the selected file.
 */
function findOpenDocument(targetUri: vscode.Uri): vscode.TextDocument | undefined {
  return vscode.workspace.textDocuments.find(
    (document) => document.uri.fsPath === targetUri.fsPath,
  );
}

/**
 * Copies all saved changes in the selected file since HEAD.
 *
 * The URI is normally supplied by an Explorer or editor-tab context menu.
 * When no URI is supplied, the command falls back to the active editor file.
 *
 * @param uri - The file selected when the command was invoked.
 */
export async function executeCopyFileDiffCommand(uri?: vscode.Uri): Promise<void> {
  try {
    const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;

    if (!targetUri) {
      void vscode.window.showWarningMessage("CZaza: No file is currently selected.");
      return;
    }

    if (targetUri.scheme !== "file") {
      void vscode.window.showWarningMessage("CZaza: Only local files can currently be compared.");
      return;
    }

    const fileName = path.basename(targetUri.fsPath);
    const stat = await vscode.workspace.fs.stat(targetUri);

    if (stat.type !== vscode.FileType.File) {
      void vscode.window.showWarningMessage("CZaza: Please select a file rather than a folder.");
      return;
    }

    /**
     * Git reads the saved file from disk. An unsaved editor document may
     * therefore differ from the diff that Git returns.
     */
    const openDocument = findOpenDocument(targetUri);

    if (openDocument?.isDirty) {
      void vscode.window.showWarningMessage(`CZaza: Save ${fileName} before copying its Git diff.`);
      return;
    }

    const result = await getFileDiff(targetUri.fsPath);

    switch (result.kind) {
      case "notGitRepository":
        void vscode.window.showWarningMessage(`CZaza: ${fileName} is not inside a Git repository.`);
        return;

      case "noHead":
        void vscode.window.showWarningMessage(
          "CZaza: Cannot copy a diff because this repository has no HEAD commit yet.",
        );
        return;

      case "untracked":
        void vscode.window.showWarningMessage(
          `CZaza: ${fileName} is untracked. Use Copy File instead.`,
        );
        return;

      case "noChanges":
        void vscode.window.showInformationMessage(
          `CZaza: No changes found for ${fileName} compared with HEAD.`,
        );
        return;

      case "diff":
        await vscode.env.clipboard.writeText(result.diff);

        void vscode.window.showInformationMessage(
          `CZaza: Copied all changes in ${fileName} since HEAD.`,
        );
        return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    void vscode.window.showErrorMessage(`CZaza: Failed to copy the file diff. ${message}`);
  }
}
