/**
 * Ensures file-note resource anchors reflect current path availability.
 */

import * as path from "node:path";

import { applyFileNoteResourceMissing } from "@shared/services/notes/fileNoteChangeService";
import type { WorkspaceNoteStore } from "@vscode/notes";
import * as vscode from "vscode";

/** Result of checking a file-note resource path. */
export type FileNoteResourceAvailabilityResult = {
  /** Whether the source resource currently exists on disk. */
  available: boolean;
  /** Whether the stored note status was changed. */
  changed: boolean;
};

/**
 * Lazily marks a file note as needing confirmation when its path is missing.
 *
 * Missing during a snapshot does not prove deletion, so this uses
 * `needsConfirmation` rather than `orphaned`.
 */
export async function ensureFileNoteResourceAvailability(input: {
  notes: WorkspaceNoteStore;
  workspaceRoot: string;
  outputDirectory: string;
  relativePath: string;
  now: string;
}): Promise<FileNoteResourceAvailabilityResult> {
  const uri = vscode.Uri.file(path.join(input.workspaceRoot, ...input.relativePath.split("/")));

  try {
    await vscode.workspace.fs.stat(uri);
    return { available: true, changed: false };
  } catch {
    const sourceFile = await input.notes.cache.getSourceFile(
      input.workspaceRoot,
      input.outputDirectory,
      input.relativePath,
    );

    if (!sourceFile?.fileNote) {
      return { available: false, changed: false };
    }

    const applied = applyFileNoteResourceMissing({
      sourceFile,
      relativePath: input.relativePath,
      now: input.now,
    });

    if (!applied.changed) {
      return { available: false, changed: false };
    }

    await input.notes.cache.saveSourceFile(
      input.workspaceRoot,
      input.outputDirectory,
      input.relativePath,
      applied.sourceFile,
      input.now,
    );

    return { available: false, changed: true };
  }
}
