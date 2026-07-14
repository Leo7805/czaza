/**
 * Registers CZaza root directory validation for VS Code activation and settings changes.
 */

import * as vscode from "vscode";

import { getCzazaSettings } from "./czazaSettings";
import { resolveCzazaRootDirectory } from "./resolveCzazaRootDirectory";

/**
 * Registers root directory validation for extension activation and configuration updates.
 *
 * Missing workspaces are ignored because CZaza notes are only enabled for
 * workspace-backed project files. Explicitly configured invalid roots are
 * reported so users can fix the setting before running note operations.
 *
 * @param context - Current VS Code extension context.
 *
 * @example
 * registerCzazaRootValidation(context);
 */
export function registerCzazaRootValidation(context: vscode.ExtensionContext): void {
  validateConfiguredCzazaRoot();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("czaza.rootDirectory")) {
        validateConfiguredCzazaRoot();
      }
    }),
  );
}

function validateConfiguredCzazaRoot(): void {
  const settings = getCzazaSettings();

  if (!settings.rootDirectory) {
    return;
  }

  try {
    resolveCzazaRootDirectory();
  } catch (error) {
    if (isMissingWorkspaceError(error)) {
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown root directory error.";

    void vscode.window.showWarningMessage(`CZaza root directory is invalid: ${message}`);
  }
}

function isMissingWorkspaceError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("requires an open VS Code workspace folder");
}
