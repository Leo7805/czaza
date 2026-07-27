/**
 * Registers VS Code file resource events that keep note resource anchors synchronized.
 */

import * as vscode from "vscode";

import { getCzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";
import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";
import {
  GitAwareSourceChangeGate,
  type GitWorkspaceTransitionGuard,
  type SourceChangeRevisionToken,
} from "@vscode/services/workspaceTransition";

const RESOURCE_CHANGE_CONFIRMATION_MS = 800;

/**
 * Registers file rename, move, and delete handlers for stored CZaza notes.
 *
 * @param context - Current VS Code extension context.
 * @param notes - Shared workspace note store.
 * @param notesProvider - Optional notes webview provider to refresh after stored changes.
 * @param workspaceTransitionGuard - Optional Git transition state that suppresses checkout events.
 *
 * @example
 * registerNotesResourceEvents(context, notes);
 */
export function registerNotesResourceEvents(
  context: vscode.ExtensionContext,
  notes: WorkspaceNoteStore,
  notesProvider?: NotesViewProvider,
  workspaceTransitionGuard?: GitWorkspaceTransitionGuard,
): void {
  const resourceChangeGate = workspaceTransitionGuard
    ? new GitAwareSourceChangeGate(
      RESOURCE_CHANGE_CONFIRMATION_MS,
      workspaceTransitionGuard,
    )
    : undefined;

  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles((event) => {
      const token = resourceChangeGate?.captureToken();

      for (const file of event.files) {
        void handleRename(
          notes,
          file.oldUri,
          file.newUri,
          notesProvider,
          resourceChangeGate,
          token,
        );
      }
    }),
    vscode.workspace.onDidDeleteFiles((event) => {
      const token = resourceChangeGate?.captureToken();

      for (const uri of event.files) {
        void handleDelete(
          notes,
          uri,
          notesProvider,
          resourceChangeGate,
          token,
        );
      }
    }),
    ...(resourceChangeGate ? [resourceChangeGate] : []),
  );
}

/**
 * Applies one VS Code rename event after its Git confirmation window.
 *
 * @param notes - Shared workspace note store.
 * @param oldUri - Resource URI before the rename.
 * @param newUri - Resource URI after the rename.
 * @param notesProvider - Optional Notes view refreshed after the move.
 * @param resourceChangeGate - Optional Git-aware confirmation gate.
 * @param token - Revision captured when the rename event arrived.
 * @returns Promise resolved after the move or cancellation.
 */
async function handleRename(
  notes: WorkspaceNoteStore,
  oldUri: vscode.Uri,
  newUri: vscode.Uri,
  notesProvider: NotesViewProvider | undefined,
  resourceChangeGate: GitAwareSourceChangeGate | undefined,
  token: SourceChangeRevisionToken | undefined,
): Promise<void> {
  try {
    if (oldUri.scheme !== "file" || newUri.scheme !== "file") {
      return;
    }

    const oldResource = resolveNotesResource(oldUri);
    const newResource = resolveNotesResource(newUri);

    if (oldResource.rootDirectory !== newResource.rootDirectory) {
      return;
    }

    if (
      resourceChangeGate &&
      token &&
      !(await resourceChangeGate.confirmPersistence(token))
    ) {
      return;
    }

    const result = await notes.resources.moveSourceFileEntry(
      oldResource.rootDirectory,
      oldResource.outputDirectory,
      oldResource.relativePath,
      newResource.relativePath,
      new Date().toISOString(),
    );

    if (result.kind === "moved") {
      await notesProvider?.refreshAfterResourceMove(oldUri, newUri);
    }
  } catch (error) {
    console.error("Failed to move CZaza notes after a file rename.", error);
  }
}

/**
 * Applies one VS Code delete event after its Git confirmation window.
 *
 * @param notes - Shared workspace note store.
 * @param uri - Deleted resource URI.
 * @param notesProvider - Optional Notes view refreshed after deletion.
 * @param resourceChangeGate - Optional Git-aware confirmation gate.
 * @param token - Revision captured when the delete event arrived.
 * @returns Promise resolved after deletion marking or cancellation.
 */
async function handleDelete(
  notes: WorkspaceNoteStore,
  uri: vscode.Uri,
  notesProvider: NotesViewProvider | undefined,
  resourceChangeGate: GitAwareSourceChangeGate | undefined,
  token: SourceChangeRevisionToken | undefined,
): Promise<void> {
  try {
    if (uri.scheme !== "file") {
      return;
    }

    const resource = resolveNotesResource(uri);

    if (
      resourceChangeGate &&
      token &&
      !(await resourceChangeGate.confirmPersistence(token))
    ) {
      return;
    }

    const result = await notes.resources.markSourceFileEntryDeleted(
      resource.rootDirectory,
      resource.outputDirectory,
      resource.relativePath,
      new Date().toISOString(),
    );

    if (result.kind === "markedDeleted") {
      await notesProvider?.refreshAfterResourceDelete(uri);
    }
  } catch (error) {
    console.error("Failed to mark CZaza notes after a file delete.", error);
  }
}

/**
 * Resolves one file URI into the configured CZaza resource coordinates.
 *
 * @param uri - File resource to resolve.
 * @returns Workspace root, output directory, and CZaza-relative path.
 */
function resolveNotesResource(uri: vscode.Uri): {
  rootDirectory: string;
  outputDirectory: string;
  relativePath: string;
} {
  const resolvedRoot = resolveCzazaRootDirectory(uri);
  const settings = getCzazaSettings(uri);

  return {
    rootDirectory: resolvedRoot.rootDirectory,
    outputDirectory: settings.outputDirectory,
    relativePath: getCzazaRelativePath(uri, resolvedRoot.rootDirectory),
  };
}
