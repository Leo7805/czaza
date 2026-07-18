/**
 * Deletes one line note from the current Navigator resource.
 */

import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import type { WorkspaceNoteStore } from "@vscode/notes";
import * as vscode from "vscode";

/** Input for deleting one Navigator line note. */
export type DeleteNavigatorLineNoteInput = {
  /** Current source URI that owns the line note. */
  currentUri: vscode.Uri;

  /** Shared workspace note store. */
  notes: WorkspaceNoteStore;

  /** Stable line note id. */
  lineId: string;
};

/** Deletes one line note from the current file's stored notes. */
export async function deleteNavigatorLineNoteService(
  input: DeleteNavigatorLineNoteInput,
): Promise<void> {
  const resolvedRoot = resolveCzazaRootDirectory(input.currentUri);
  const settings = getCzazaSettings(input.currentUri);
  const relativePath = getCzazaRelativePath(input.currentUri, resolvedRoot.rootDirectory);

  await input.notes.crud.deleteLineNote(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    relativePath,
    input.lineId,
    new Date().toISOString(),
  );
}
