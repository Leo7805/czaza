/**
 * Main entry point for the CZaza VS Code extension.
 */

import * as vscode from "vscode";
import { registerCzazaRootValidation } from "./config/registerCzazaRootValidation";
import { registerCzazaCommands } from "./commands/registerCzazaCommands";
import {
  registerPassiveRuntimeNoteChecks,
  registerNotesContentEvents,
  registerNotesPreviewEvents,
  registerNotesResourceEvents,
} from "./events";
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
  SourceRelocationHistoryService,
} from "./services/noteRelocation";
import { RuntimeNoteStateRegistry } from "./services/runtimeState";
import { ChangeTaskCoordinator } from "./services/changeCoordination";
import { PersonalIdentityService } from "./personalNotes";

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
  const runtimeNoteStateRegistry = new RuntimeNoteStateRegistry();
  const sourceRelocationHistory = new SourceRelocationHistoryService();
  const changeTaskCoordinator = new ChangeTaskCoordinator(800);
  const personalIdentities = new PersonalIdentityService(context.workspaceState);
  context.subscriptions.push(changeTaskCoordinator);

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
    runtimeNoteStateRegistry,
  );
  context.subscriptions.push(notesProvider);

  // ---------------------------------------------------------------------------
  // 2. Register command palette and context-menu commands.
  // ---------------------------------------------------------------------------

  registerCzazaCommands({ context, notes, notesProvider, personalIdentities });

  // ---------------------------------------------------------------------------
  // 3. Register lifecycle checks that are not user commands.
  // ---------------------------------------------------------------------------

  registerCzazaRootValidation(context);

  // ---------------------------------------------------------------------------
  // 4. Register visible VS Code UI surfaces.
  // ---------------------------------------------------------------------------

  registerNotesUi(context, notesProvider);

  // ---------------------------------------------------------------------------
  // 5. Follow VS Code resource events that update visible notes.
  // ---------------------------------------------------------------------------

  registerNotesPreviewEvents(context, notesProvider);
  registerPassiveRuntimeNoteChecks(context, notes, runtimeNoteStateRegistry);
  registerNotesContentEvents(
    context,
    notes,
    notesProvider,
    runtimeNoteStateRegistry,
    sourceRelocationHistory,
    changeTaskCoordinator,
  );
  registerNotesResourceEvents(
    context,
    notes,
    notesProvider,
    runtimeNoteStateRegistry,
    sourceRelocationHistory,
    changeTaskCoordinator,
  );
}

/**
 * Deactivates the CZaza VS Code extension.
 */
export function deactivate() {}
