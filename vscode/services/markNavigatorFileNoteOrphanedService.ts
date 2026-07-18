/**
 * Marks a Navigator file note as explicitly orphaned.
 */

import type { NoteStatus } from "@shared/models/domain/common";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import { resolveCzazaRootDirectory } from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";
import * as vscode from "vscode";

/** Input for orphaning one Navigator file-note item. */
export type MarkNavigatorFileNoteOrphanedInput = {
  /** Current resource URI used to resolve the CZaza root. */
  currentUri: vscode.Uri;

  /** Shared workspace note store. */
  notes: WorkspaceNoteStore;

  /** CZaza-root-relative source path for the file note. */
  relativePath: string;
};

/**
 * Marks one file note anchor as orphaned while preserving its content status.
 */
export async function markNavigatorFileNoteOrphanedService(
  input: MarkNavigatorFileNoteOrphanedInput,
): Promise<boolean> {
  const resolvedRoot = resolveCzazaRootDirectory(input.currentUri);
  const settings = getCzazaSettings(input.currentUri);
  const sourceFile = await input.notes.cache.getSourceFile(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    input.relativePath,
  );
  const status = getOrphanedStatus(sourceFile?.fileNote?.status);

  if (!status) {
    return false;
  }

  await input.notes.update.updateFileNoteStatus(
    resolvedRoot.rootDirectory,
    settings.outputDirectory,
    input.relativePath,
    status,
    new Date().toISOString(),
  );

  return true;
}

function getOrphanedStatus(status: NoteStatus | undefined): NoteStatus | undefined {
  if (!status || status.anchor === "orphaned") {
    return undefined;
  }

  return {
    ...status,
    anchor: "orphaned",
  };
}
