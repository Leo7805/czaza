/**
 * Deletes a Navigator file notes bundle.
 */

import * as path from "node:path";

import { getCzazaSettings } from "@vscode/config/czazaSettings";
import { resolveCzazaRootDirectory } from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";
import * as vscode from "vscode";

/** Input for deleting one Navigator file notes bundle. */
export type DeleteNavigatorFileNotesInput = {
  /** Current resource URI used to resolve the CZaza root. */
  currentUri: vscode.Uri;

  /** Shared workspace note store. */
  notes: WorkspaceNoteStore;

  /** CZaza-root-relative source path for the notes bundle. */
  relativePath: string;
};

/**
 * Deletes one file's full notes bundle while leaving the source file untouched.
 */
export async function deleteNavigatorFileNotesService(
  input: DeleteNavigatorFileNotesInput,
): Promise<boolean> {
  const relativePath = normalizeRelativePath(input.relativePath);

  if (!isSafeRelativePath(relativePath)) {
    throw new Error("Enter a path relative to the CZaza root.");
  }

  const { rootDirectory } = resolveCzazaRootDirectory(input.currentUri);
  const settings = getCzazaSettings(input.currentUri);
  const result = await input.notes.resources.deleteSourceFileEntry(
    rootDirectory,
    settings.outputDirectory,
    relativePath,
    new Date().toISOString(),
  );

  return result.kind === "deleted";
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.trim().replaceAll("\\", "/");
}

function isSafeRelativePath(relativePath: string): boolean {
  if (!relativePath || path.isAbsolute(relativePath)) {
    return false;
  }

  const segments = relativePath.split("/");

  return segments.every((segment) => segment && segment !== "." && segment !== "..");
}
