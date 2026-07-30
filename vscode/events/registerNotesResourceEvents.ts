/**
 * Registers VS Code file resource events that keep note resource anchors synchronized.
 */

import * as vscode from "vscode";

import type { WorkspaceNoteStore } from "@vscode/notes";
import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";
import type { ChangeTaskCoordinator } from "@vscode/services/changeCoordination";
import type { SourceRelocationHistoryService } from "@vscode/services/noteRelocation";
import { evaluateCzazaResourceAccess } from "@vscode/services/resourceAccess";
import type { RuntimeNoteStateRegistry } from "@vscode/services/runtimeState";

/**
 * Registers file rename, move, and delete handlers for stored CZaza notes.
 *
 * @param context - Current VS Code extension context.
 * @param notes - Shared workspace note store.
 * @param notesProvider - Optional notes webview provider to refresh after stored changes.
 * @param runtimeNoteStateRegistry - Optional session registry synchronized after resource changes.
 * @param relocationHistory - Optional shared history invalidated by resource identity changes.
 * @param changeCoordinator - Optional coordinator marking deterministic deletions.
 *
 * @example
 * registerNotesResourceEvents(context, notes);
 */
export function registerNotesResourceEvents(
  context: vscode.ExtensionContext,
  notes: WorkspaceNoteStore,
  notesProvider?: NotesViewProvider,
  runtimeNoteStateRegistry?: RuntimeNoteStateRegistry,
  relocationHistory?: SourceRelocationHistoryService,
  changeCoordinator?: ChangeTaskCoordinator,
): void {
  context.subscriptions.push(
    vscode.workspace.onWillDeleteFiles((event) => {
      for (const uri of event.files) {
        changeCoordinator?.markDeleted(uri);
      }
    }),
    vscode.workspace.onDidRenameFiles((event) => {
      for (const file of event.files) {
        relocationHistory?.clear(file.oldUri.toString());
        relocationHistory?.clear(file.newUri.toString());
        void handleRename(
          notes,
          file.oldUri,
          file.newUri,
          notesProvider,
          runtimeNoteStateRegistry,
        );
      }
    }),
    vscode.workspace.onDidDeleteFiles((event) => {
      for (const uri of event.files) {
        relocationHistory?.clear(uri.toString());
        void handleDelete(
          notes,
          uri,
          notesProvider,
          runtimeNoteStateRegistry,
        );
      }
    }),
  );
}

/**
 * Applies one deterministic VS Code file rename immediately after access validation.
 *
 * @param notes - Shared workspace note store.
 * @param oldUri - Resource URI before the rename.
 * @param newUri - Resource URI after the rename.
 * @param notesProvider - Optional Notes view refreshed after the move.
 * @param runtimeNoteStateRegistry - Optional session registry moved with the resource.
 * @returns Promise resolved after the move or cancellation.
 */
async function handleRename(
  notes: WorkspaceNoteStore,
  oldUri: vscode.Uri,
  newUri: vscode.Uri,
  notesProvider: NotesViewProvider | undefined,
  runtimeNoteStateRegistry: RuntimeNoteStateRegistry | undefined,
): Promise<void> {
  try {
    const oldResource = evaluateCzazaResourceAccess(oldUri);
    const newResource = evaluateCzazaResourceAccess(newUri);

    if (!oldResource.allowed || !newResource.allowed) {
      return;
    }

    if (
      oldResource.root.rootDirectory !== newResource.root.rootDirectory ||
      oldResource.settings.outputDirectory !== newResource.settings.outputDirectory
    ) {
      return;
    }

    const result = await notes.resources.moveSourceEntriesUnderPath(
      oldResource.root.rootDirectory,
      oldResource.settings.outputDirectory,
      oldResource.relativePath,
      newResource.relativePath,
      new Date().toISOString(),
    );

    if (result.kind === "moved") {
      runtimeNoteStateRegistry?.moveStatesUnderPath(
        {
          workspaceRoot: oldResource.root.rootDirectory,
          outputDirectory: oldResource.settings.outputDirectory,
        },
        oldResource.relativePath,
        newResource.relativePath,
      );
      await notesProvider?.refreshAfterResourceMove(oldUri, newUri);
    }
  } catch (error) {
    console.error("Failed to move CZaza notes after a file rename.", error);
  }
}

/**
 * Applies one deterministic VS Code file delete immediately after access validation.
 *
 * @param notes - Shared workspace note store.
 * @param uri - Deleted resource URI.
 * @param notesProvider - Optional Notes view refreshed after deletion.
 * @param runtimeNoteStateRegistry - Optional session registry cleared after deletion.
 * @returns Promise resolved after deletion marking or cancellation.
 */
async function handleDelete(
  notes: WorkspaceNoteStore,
  uri: vscode.Uri,
  notesProvider: NotesViewProvider | undefined,
  runtimeNoteStateRegistry: RuntimeNoteStateRegistry | undefined,
): Promise<void> {
  try {
    const resource = evaluateCzazaResourceAccess(uri);

    if (!resource.allowed) {
      return;
    }

    const result = await notes.resources.markSourceEntriesUnderPathDeleted(
      resource.root.rootDirectory,
      resource.settings.outputDirectory,
      resource.relativePath,
      new Date().toISOString(),
    );

    if (result.kind === "markedDeleted") {
      runtimeNoteStateRegistry?.deleteStatesUnderPath({
        workspaceRoot: resource.root.rootDirectory,
        outputDirectory: resource.settings.outputDirectory,
      }, resource.relativePath);
      await notesProvider?.refreshAfterResourceDelete(uri);
    }
  } catch (error) {
    console.error("Failed to mark CZaza notes after a file delete.", error);
  }
}
