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

/**
 * Registers file rename, move, and delete handlers for stored CZaza notes.
 *
 * @param context - Current VS Code extension context.
 * @param notes - Shared workspace note store.
 * @param notesProvider - Optional notes webview provider to refresh after stored changes.
 *
 * @example
 * registerNotesResourceEvents(context, notes);
 */
export function registerNotesResourceEvents(
  context: vscode.ExtensionContext,
  notes: WorkspaceNoteStore,
  notesProvider?: NotesViewProvider,
): void {
  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles((event) => {
      for (const file of event.files) {
        void handleRename(notes, file.oldUri, file.newUri, notesProvider);
      }
    }),
    vscode.workspace.onDidDeleteFiles((event) => {
      for (const uri of event.files) {
        void handleDelete(notes, uri, notesProvider);
      }
    }),
  );
}

async function handleRename(
  notes: WorkspaceNoteStore,
  oldUri: vscode.Uri,
  newUri: vscode.Uri,
  notesProvider: NotesViewProvider | undefined,
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

async function handleDelete(
  notes: WorkspaceNoteStore,
  uri: vscode.Uri,
  notesProvider: NotesViewProvider | undefined,
): Promise<void> {
  try {
    if (uri.scheme !== "file") {
      return;
    }

    const resource = resolveNotesResource(uri);

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
