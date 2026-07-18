/**
 * Deletes one section note from the current Navigator resource.
 */

import {
  getCzazaRelativePath,
  resolveCzazaRootDirectory,
} from "@vscode/config/resolveCzazaRootDirectory";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import type { WorkspaceNoteStore } from "@vscode/notes";
import * as vscode from "vscode";

/** Input for deleting one Navigator section note. */
export type DeleteNavigatorSectionNoteInput = {
  /** Current source URI that owns the section note. */
  currentUri: vscode.Uri;

  /** Shared workspace note store. */
  notes: WorkspaceNoteStore;

  /** Stable section note id. */
  sectionId: string;
};

/** Deletes one section note from the current file's stored notes. */
export async function deleteNavigatorSectionNoteService(
  input: DeleteNavigatorSectionNoteInput,
): Promise<void> {
  const resolvedRoot = resolveCzazaRootDirectory(input.currentUri);
  const settings = getCzazaSettings(input.currentUri);
  const relativePath = getCzazaRelativePath(input.currentUri, resolvedRoot.rootDirectory);

  await input.notes.crud.deleteSectionNote(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    relativePath,
    input.sectionId,
    new Date().toISOString(),
  );
}
