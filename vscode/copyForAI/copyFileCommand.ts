/**
 * Implements the VS Code command for copying a local file as a file object.
 */

import path from "node:path";

import * as vscode from "vscode";

import { copyFileToClipboard } from "./copyFileToClipboard";

/**
 * Copies the selected Explorer or editor file to the macOS clipboard.
 *
 * When the command is not given a URI, it falls back to the file
 * currently open in the active text editor.
 */
export async function executeCopyFileCommand(uri?: vscode.Uri): Promise<void> {
  try {
    if (process.platform !== "darwin") {
      void vscode.window.showWarningMessage("CZaza: Copy File currently supports macOS only.");
      return;
    }

    const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;

    if (!targetUri) {
      void vscode.window.showWarningMessage("CZaza: No file is currently selected.");
      return;
    }

    if (targetUri.scheme !== "file") {
      void vscode.window.showWarningMessage("CZaza: Only local files can currently be copied.");
      return;
    }

    const stat = await vscode.workspace.fs.stat(targetUri);

    if (stat.type !== vscode.FileType.File) {
      void vscode.window.showWarningMessage("CZaza: Please select a file rather than a folder.");
      return;
    }

    await copyFileToClipboard(targetUri.fsPath);

    void vscode.window.showInformationMessage(
      `Copied ${path.basename(targetUri.fsPath)} as a file.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    void vscode.window.showErrorMessage(`CZaza: Failed to copy the file. ${message}`);
  }
}
