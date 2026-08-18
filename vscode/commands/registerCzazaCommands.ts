/**
 * Registers all command handlers contributed by the CZaza VS Code extension.
 */

import * as vscode from "vscode";

import { registerCopyForAICommands } from "@vscode/copyForAI/registerCopyForAICommands";
import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";
import type { PersonalIdentityService } from "@vscode/personalNotes";

import { registerAddNoteCommands } from "./addNoteCommands";
import { registerApiKeyManagementCommand } from "./apiKeyManagementCommand";
import { registerShowCurrentSettingsCommand } from "./showCurrentSettingsCommand";
import { registerSelectPersonalIdentityCommand } from "./selectPersonalIdentityCommand";

/**
 * Dependencies required to register command handlers.
 */
export type RegisterCzazaCommandsInput = {
  /**
   * Current VS Code extension context.
   */
  context: vscode.ExtensionContext;

  /** Notes provider used to open User Note editing. */
  notesProvider: NotesViewProvider;

  /** Personal Notes identity selection and persistence service. */
  personalIdentities: PersonalIdentityService;
};

/**
 * Registers every CZaza command handler.
 *
 * @param input - Command registration dependencies.
 *
 * @example
 * registerCzazaCommands({
 *   context,
 *   notesProvider,
 *   personalIdentities,
 * });
 */
export function registerCzazaCommands(input: RegisterCzazaCommandsInput): void {
  registerCopyForAICommands(input.context);
  registerAddNoteCommands({
    context: input.context,
    provider: input.notesProvider,
  });
  registerApiKeyManagementCommand(input.context);
  registerShowCurrentSettingsCommand(input.context);
  registerSelectPersonalIdentityCommand(input.context, input.personalIdentities);
}
