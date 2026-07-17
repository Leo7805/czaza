/**
 * Registers VS Code document save events that mark file notes stale after content changes.
 */

import { createSourceHash } from "@shared/utils/hashUtils";
import { detectFileNoteContentChange, applyFileNoteContentChange } from "@shared/services/notes/fileNoteChangeService";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";
import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";
import * as vscode from "vscode";

/**
 * Registers save handlers for source content freshness detection.
 *
 * @param context - Current VS Code extension context.
 * @param notes - Shared workspace note store.
 * @param notesProvider - Optional notes webview provider to refresh after stored changes.
 *
 * @example
 * registerNotesContentEvents(context, notes);
 */
export function registerNotesContentEvents(
  context: vscode.ExtensionContext,
  notes: WorkspaceNoteStore,
  notesProvider?: NotesViewProvider,
): void {
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      void handleSave(notes, document, notesProvider);
    }),
  );
}

async function handleSave(
  notes: WorkspaceNoteStore,
  document: vscode.TextDocument,
  notesProvider: NotesViewProvider | undefined,
): Promise<void> {
  try {
    if (document.uri.scheme !== "file") {
      return;
    }

    const resolvedRoot = resolveCzazaRootDirectory(document.uri);
    const settings = getCzazaSettings(document.uri);
    const relativePath = getCzazaRelativePath(document.uri, resolvedRoot.rootDirectory);
    const sourceFile = await notes.cache.getSourceFile(
      resolvedRoot.rootDirectory,
      settings.outputDirectory,
      relativePath,
    );

    if (!sourceFile) {
      return;
    }

    const detection = detectFileNoteContentChange({
      previousSourceHash: sourceFile.source.sourceHash,
      nextSourceHash: createSourceHash(document.getText()),
    });
    const now = new Date().toISOString();
    const result = applyFileNoteContentChange({
      sourceFile,
      detection,
      now,
    });

    if (!result.changed) {
      return;
    }

    await notes.cache.saveSourceFile(
      resolvedRoot.rootDirectory,
      settings.outputDirectory,
      relativePath,
      result.sourceFile,
      now,
    );
    await notesProvider?.refreshCurrentNotes(document.uri);
  } catch (error) {
    console.error("Failed to update CZaza note freshness after a file save.", error);
  }
}
