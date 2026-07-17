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
import { generateAllNotesForResource } from "./services/generateAllNotesService";
import { generateFileNotesForResource } from "./services/generateFileNotesService";
import { generateLineNoteForResource } from "./services/generateLineNoteService";
import { generateLineBatchNotesForResource } from "./services/generateLineBatchNoteService";
import { generateSectionNoteForResource } from "./services/generateSectionNoteService";
import { saveUserNoteService } from "./services/saveUserNoteService";
import { WorkspaceNoteStore } from "./notes";
import { NotesViewProvider } from "./notesUi/NotesViewProvider";
import { registerNotesUi } from "./notesUi/registerNotesUi";

/**
 * Activates the CZaza VS Code extension.
 */
export function activate(context: vscode.ExtensionContext) {
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
    (uri) => generateAllNotesForResource(context, notes, uri),
    (uri, lineNumber) => generateLineNoteForResource(context, notes, uri, lineNumber),
    (uri, sectionId) => generateSectionNoteForResource(context, notes, uri, sectionId),
    (uri, lineNumber) => generateLineBatchNotesForResource(context, notes, uri, lineNumber),
  );
  context.subscriptions.push(notesProvider);

  // ---------------------------------------------------------------------------
  // 2. Register command palette and context-menu commands.
  // ---------------------------------------------------------------------------

  registerCzazaCommands({ context, notes, notesProvider });

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
  registerNotesContentEvents(context, notes, notesProvider);
  registerNotesResourceEvents(context, notes, notesProvider);
}

/**
 * Deactivates the CZaza VS Code extension.
 */
export function deactivate() {}
