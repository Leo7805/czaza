/**
 * Registers all command handlers contributed by the CZaza VS Code extension.
 */

import * as vscode from "vscode";

import { registerCopyForAICommands } from "@vscode/copyForAI/registerCopyForAICommands";

import { registerApiKeyManagementCommand } from "./apiKeyManagementCommand";
import { registerShowCurrentSettingsCommand } from "./showCurrentSettingsCommand";

/**
 * Dependencies required to register command handlers.
 */
export type RegisterCzazaCommandsInput = {
  /**
   * Current VS Code extension context.
   */
  context: vscode.ExtensionContext;
};

/**
 * Registers every CZaza command handler.
 *
 * @param input - Command registration dependencies.
 *
 * @example
 * registerCzazaCommands({
 *   context,
 * });
 */
export function registerCzazaCommands(input: RegisterCzazaCommandsInput): void {
  registerCopyForAICommands(input.context);
  registerApiKeyManagementCommand(input.context);
  registerShowCurrentSettingsCommand(input.context);
}
