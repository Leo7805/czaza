/**
 * Relocates a file-note entry after the user confirms its new path.
 */

import * as path from "node:path";

import type { NoteStatus } from "@shared/models/domain/common";
import {
  isCzazaManagedRelativePath,
  isPathInsideDirectory,
} from "@shared/utils/managedOutputPath";
import { getCzazaSettings } from "@vscode/config/czazaSettings";
import { resolveCzazaRootDirectory } from "@vscode/config/resolveCzazaRootDirectory";
import type { WorkspaceNoteStore } from "@vscode/notes";
import { getWorkspaceNoteIndexPath } from "@vscode/notes/WorkspaceNoteStoreRepository";
import * as vscode from "vscode";

/** Successful file-note relocation result. */
export type RelocateFileNoteResult = {
  previousRelativePath: string;
  nextRelativePath: string;
  targetUri: vscode.Uri;
};

/** Input for relocating one Navigator file-note item. */
export type RelocateFileNoteInput = {
  /** Current resource URI used to resolve the CZaza root. */
  currentUri: vscode.Uri;

  /** Shared workspace note store. */
  notes: WorkspaceNoteStore;

  /** Existing CZaza-root-relative source path. */
  fromRelativePath: string;

  /** User-confirmed CZaza-root-relative source path. */
  toRelativePath: string;
};

/**
 * Validates and moves one file-note entry to a user-confirmed source path.
 */
export async function relocateFileNoteService(
  input: RelocateFileNoteInput,
): Promise<RelocateFileNoteResult> {
  const fromRelativePath = normalizeRelativePath(input.fromRelativePath);
  const toRelativePath = normalizeRelativePath(input.toRelativePath);

  if (!isSafeRelativePath(fromRelativePath) || !isSafeRelativePath(toRelativePath)) {
    throw new Error("Enter a path relative to the CZaza root.");
  }

  const { rootDirectory } = resolveCzazaRootDirectory(input.currentUri);
  const settings = getCzazaSettings(input.currentUri);
  const targetPath = path.resolve(rootDirectory, toRelativePath);
  const managedNotesDirectory = path.dirname(
    getWorkspaceNoteIndexPath(rootDirectory, settings.outputDirectory),
  );

  if (
    isCzazaManagedRelativePath(rootDirectory, settings.outputDirectory, toRelativePath) ||
    isPathInsideDirectory(targetPath, managedNotesDirectory)
  ) {
    throw new Error("CZaza-managed output files cannot be used as File Note targets.");
  }

  const targetUri = vscode.Uri.file(targetPath);

  try {
    const stat = await vscode.workspace.fs.stat(targetUri);

    if (stat.type & vscode.FileType.Directory) {
      throw new Error("Choose a file path, not a directory.");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Choose a file path, not a directory.") {
      throw error;
    }

    throw new Error(`${toRelativePath} does not exist.`);
  }

  if (fromRelativePath === toRelativePath) {
    const sourceFile = await input.notes.cache.getSourceFile(
      rootDirectory,
      settings.outputDirectory,
      fromRelativePath,
    );
    const confirmedStatus = getConfirmedStatus(sourceFile?.fileNote?.status);

    if (!sourceFile?.fileNote) {
      throw new Error(`${fromRelativePath} no longer has stored notes.`);
    }

    if (!confirmedStatus) {
      throw new Error(`${fromRelativePath} is already linked.`);
    }

    await input.notes.update.updateFileNoteStatus(
      rootDirectory,
      settings.outputDirectory,
      fromRelativePath,
      confirmedStatus,
      new Date().toISOString(),
    );

    return {
      previousRelativePath: fromRelativePath,
      nextRelativePath: toRelativePath,
      targetUri,
    };
  }

  const result = await input.notes.resources.moveSourceFileEntry(
    rootDirectory,
    settings.outputDirectory,
    fromRelativePath,
    toRelativePath,
    new Date().toISOString(),
  );

  if (result.kind === "notFound") {
    throw new Error(`${fromRelativePath} no longer has stored notes.`);
  }

  if (result.kind === "conflict") {
    throw new Error(`${toRelativePath} already has stored notes.`);
  }

  if (result.kind === "protectedPath") {
    throw new Error("CZaza-managed output files cannot be used as File Note targets.");
  }

  return {
    previousRelativePath: result.previousRelativePath,
    nextRelativePath: result.nextRelativePath,
    targetUri,
  };
}

function getConfirmedStatus(status: NoteStatus | undefined): NoteStatus | undefined {
  if (!status || status.anchor !== "orphaned") {
    return undefined;
  }

  return {
    ...status,
    anchor: "confirmed",
  };
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
