/**
 * Main entry point for the CZaza VS Code extension.
 */

import * as vscode from "vscode";
import { registerCzazaRootValidation } from "./config/registerCzazaRootValidation";
import { registerCzazaCommands } from "./commands/registerCzazaCommands";
import {
  registerNotesContentEvents,
  registerNotesPreviewEvents,
  registerNotesResourceEvents,
} from "./events";
import { initializeArchitectureNotesService } from "./services/architectureNotes/initializeArchitectureNotesService";
import { generateAllNotesForResource } from "./services/generateAllNotesService";
import { generateFileNotesForResource } from "./services/generateFileNotesService";
import { generateLineNoteForResource } from "./services/generateLineNoteService";
import { generateLineBatchNotesForResource } from "./services/generateLineBatchNoteService";
import { generateSectionNoteForResource } from "./services/generateSectionNoteService";
import { saveUserNoteService } from "./services/saveUserNoteService";
import { WorkspaceNoteStore } from "./notes";
import { NotesViewProvider } from "./notesUi/NotesViewProvider";
import { registerNotesUi } from "./notesUi/registerNotesUi";
import {
  GitWorkspaceTransitionGuard,
  registerGitWorkspaceTransition,
} from "./services/workspaceTransition";

/**
 * Activates the CZaza VS Code extension.
 *
 * @param context - Current VS Code extension context.
 * @returns Nothing.
 */
export function activate(context: vscode.ExtensionContext): void {
  // ---------------------------------------------------------------------------
  // 1. Create shared runtime objects.
  // ---------------------------------------------------------------------------

  // Main note store for the new file/section/line note architecture.
  // Creating it only wires managers to one shared cache; it does not scan the
  // workspace, read all note files, or run AI analysis during activation.
  const notes = new WorkspaceNoteStore();

  // React-based notes panel provider for the new notes architecture.
  const notesProvider = new NotesViewProvider(
    context.extensionUri,
    notes,
    (uri) => generateFileNotesForResource(context, notes, uri),
    (uri, target, userNote) => saveUserNoteService({ uri, notes, target, userNote }),
    (uri, options) => generateAllNotesForResource(context, notes, uri, options),
    (uri, lineNumber) => generateLineNoteForResource(context, notes, uri, lineNumber),
    (uri, sectionId) => generateSectionNoteForResource(context, notes, uri, sectionId),
    (uri, lineNumber) => generateLineBatchNotesForResource(context, notes, uri, lineNumber),
    (resource) => initializeArchitectureNotes(context, resource, false),
  );
  context.subscriptions.push(notesProvider);
  const workspaceTransitionGuard = new GitWorkspaceTransitionGuard();
  context.subscriptions.push(workspaceTransitionGuard);

  // ---------------------------------------------------------------------------
  // 2. Register command palette and context-menu commands.
  // ---------------------------------------------------------------------------

  registerCzazaCommands({ context, notes, notesProvider });

  // ---------------------------------------------------------------------------
  // 3. Register lifecycle checks that are not user commands.
  // ---------------------------------------------------------------------------

  registerCzazaRootValidation(context);
  for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
    void initializeArchitectureNotes(context, workspaceFolder.uri, true);
  }

  // ---------------------------------------------------------------------------
  // 4. Register visible VS Code UI surfaces.
  // ---------------------------------------------------------------------------

  registerNotesUi(context, notesProvider);

  // ---------------------------------------------------------------------------
  // 5. Follow VS Code resource events that update visible notes.
  // ---------------------------------------------------------------------------

  registerNotesPreviewEvents(context, notesProvider);
  registerNotesContentEvents(
    context,
    notes,
    notesProvider,
    workspaceTransitionGuard,
  );
  registerNotesResourceEvents(
    context,
    notes,
    notesProvider,
    workspaceTransitionGuard,
  );
  void registerGitWorkspaceTransition(
    context,
    notes,
    notesProvider,
    workspaceTransitionGuard,
  ).catch((error) => {
    console.error("Failed to register CZaza Git workspace transition protection.", error);
  });
}

/**
 * Deactivates the CZaza VS Code extension.
 */
export function deactivate() {}

/**
 * Initializes Architecture Notes without allowing failures to block extension features.
 *
 * @param context - Current VS Code extension context.
 * @param resource - Resource used to resolve workspace-scoped CZaza settings.
 * @param requireExistingOutputDirectory - Whether initialization must preserve a missing output directory.
 * @returns Promise resolved after initialization or error reporting.
 */
async function initializeArchitectureNotes(
  context: vscode.ExtensionContext,
  resource: vscode.Uri | undefined,
  requireExistingOutputDirectory: boolean,
): Promise<void> {
  try {
    await initializeArchitectureNotesService({
      extensionUri: context.extensionUri,
      resource,
      requireExistingOutputDirectory,
    });
  } catch (error) {
    console.error("Failed to initialize CZaza Architecture Notes.", error);
  }
}
