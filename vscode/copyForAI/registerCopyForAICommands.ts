/**
 * Registers the Copy for AI commands provided by the VS Code extension.
 */

import * as vscode from "vscode";

import { executeCopyFileCommand } from "./copyFileCommand";
import { executeCopyFileDiffCommand } from "./copyFileDiffCommand";

/**
 * Command identifiers contributed through package.json.
 */
const COPY_FILE_COMMAND = "czaza.copyForAI.copyFile";
const COPY_FILE_DIFF_COMMAND = "czaza.copyForAI.copyFileDiff";

/**
 * Registers all Copy for AI commands.
 *
 * @param context - The active VS Code extension context.
 */
export function registerCopyForAICommands(context: vscode.ExtensionContext): void {
  const copyFileCommand = vscode.commands.registerCommand(
    COPY_FILE_COMMAND,
    executeCopyFileCommand,
  );

  const copyFileDiffCommand = vscode.commands.registerCommand(
    COPY_FILE_DIFF_COMMAND,
    executeCopyFileDiffCommand,
  );

  context.subscriptions.push(copyFileCommand, copyFileDiffCommand);
}
