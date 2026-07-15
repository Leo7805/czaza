/**
 * Registers all command handlers contributed by the CZaza VS Code extension.
 */

import * as vscode from "vscode";

import { registerCopyForAICommands } from "@vscode/copyForAI/registerCopyForAICommands";
import type { WorkspaceNoteStore } from "@vscode/notes";
import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";

import { registerAddNoteCommands } from "./addNoteCommands";
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

  /** Shared note store used by User Note commands. */
  notes: WorkspaceNoteStore;

  /** Notes provider used to open User Note editing. */
  notesProvider: NotesViewProvider;
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
  registerAddNoteCommands({
    context: input.context,
    notes: input.notes,
    provider: input.notesProvider,
  });
  registerApiKeyManagementCommand(input.context);
  registerShowCurrentSettingsCommand(input.context);
}
