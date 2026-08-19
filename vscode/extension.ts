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
import {
  TEAM_NOTE_STORE,
  WorkspaceNoteStore,
  type NoteStoreLocation,
  type ScopedWorkspaceNoteStore,
} from "./notes";
import {
  resolveCzazaRootDirectory,
} from "./config/resolveCzazaRootDirectory";
import { getCzazaSettings } from "./config/czazaSettings";
import { NotesViewProvider } from "./notesUi/NotesViewProvider";
import { registerNotesUi } from "./notesUi/registerNotesUi";
import {
  SourceRelocationHistoryService,
} from "./services/noteRelocation";
import { RuntimeNoteStateRegistry } from "./services/runtimeState";
import { ChangeTaskCoordinator } from "./services/changeCoordination";
import { PersonalIdentityService, PersonalNoteScopeService } from "./personalNotes";

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
  const noteScope = new PersonalNoteScopeService(context.workspaceState, personalIdentities);
  context.subscriptions.push(changeTaskCoordinator);

  // React-based notes panel provider for the new notes architecture.
  const notesProvider = new NotesViewProvider(
    context.extensionUri,
    notes,
    (uri, location) => generateFileNotesForResource(context, scopeNotes(notes, uri, location), uri),
    (uri, target, userNote, location) => saveUserNoteService({ uri, notes: scopeNotes(notes, uri, location), target, userNote }),
    (uri, location, options) => generateAllNotesForResource(context, scopeNotes(notes, uri, location), uri, undefined, options),
    (uri, lineNumber, location) => generateLineNoteForResource(context, scopeNotes(notes, uri, location), uri, lineNumber),
    (uri, sectionId, location) => generateSectionNoteForResource(context, scopeNotes(notes, uri, location), uri, sectionId),
    (uri, lineNumber, location) => generateLineBatchNotesForResource(context, scopeNotes(notes, uri, location), uri, lineNumber),
    runtimeNoteStateRegistry,
    noteScope,
    personalIdentities,
  );
  context.subscriptions.push(notesProvider);

  // ---------------------------------------------------------------------------
  // 2. Register command palette and context-menu commands.
  // ---------------------------------------------------------------------------

  registerCzazaCommands({ context, notesProvider, personalIdentities });

  // ---------------------------------------------------------------------------
  // 3. Register lifecycle checks that are not user commands.
  // ---------------------------------------------------------------------------

  registerCzazaRootValidation(context);

  // ---------------------------------------------------------------------------
  // 4. Register visible VS Code UI surfaces.
  // ---------------------------------------------------------------------------

  registerNotesUi(context, notesProvider, noteScope, personalIdentities);

  // ---------------------------------------------------------------------------
  // 5. Follow VS Code resource events that update visible notes.
  // ---------------------------------------------------------------------------

  registerNotesPreviewEvents(context, notesProvider);
  registerPassiveRuntimeNoteChecks(context, notes, runtimeNoteStateRegistry, noteScope);
  registerNotesContentEvents(
    context,
    notes,
    notesProvider,
    runtimeNoteStateRegistry,
    sourceRelocationHistory,
    changeTaskCoordinator,
    noteScope,
  );
  registerNotesResourceEvents(
    context,
    notes,
    notesProvider,
    runtimeNoteStateRegistry,
    sourceRelocationHistory,
    changeTaskCoordinator,
    noteScope,
  );
}

/**
 * Deactivates the CZaza VS Code extension.
 */
export function deactivate() {}

/**
 * Binds one extension workflow to the selected Team or Personal Note Store.
 *
 * @param notes - Root Store that owns shared caches.
 * @param uri - Resource used to resolve the CZaza project.
 * @param location - Selected Store location, defaulting explicitly at this compatibility boundary.
 * @returns Scoped Store for the resource project and location.
 */
function scopeNotes(
  notes: WorkspaceNoteStore,
  uri: vscode.Uri,
  location?: NoteStoreLocation,
): ScopedWorkspaceNoteStore {
  const { rootDirectory } = resolveCzazaRootDirectory(uri);
  const { outputDirectory } = getCzazaSettings(uri);
  return notes.scope(rootDirectory, outputDirectory, location ?? TEAM_NOTE_STORE);
}
