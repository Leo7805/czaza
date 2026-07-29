/**
 * Initializes the project-local Architecture Notes directory from bundled templates.
 */

import { constants } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import * as path from "node:path";

import type * as vscode from "vscode";

import { getCzazaSettings } from "@vscode/config/czazaSettings";
import { resolveCzazaRootDirectory } from "@vscode/config/resolveCzazaRootDirectory";

const ARCHITECTURE_NOTES_DIRECTORY = "architecture-notes";
const DIAGRAMS_DIRECTORY = "diagrams";
const TEMPLATE_FILES = ["AI_CONTEXT.md", "README.md"] as const;

/**
 * Describes whether Architecture Notes initialization created or skipped the destination.
 */
export type ArchitectureNotesInitializationResult =
  | { kind: "initialized"; architectureNotesDirectory: string }
  | { kind: "skipped"; reason: "outputDirectoryMissing" };

/**
 * Input for initializing Architecture Notes in one configured CZaza root.
 */
export type InitializeArchitectureNotesInput = {
  /** Extension installation URI containing the bundled templates. */
  extensionUri: vscode.Uri;
  /** Resource used to resolve workspace-scoped CZaza settings. */
  resource?: vscode.Uri;
  /** Skips initialization when the configured output directory does not exist. */
  requireExistingOutputDirectory?: boolean;
};

/**
 * Creates missing Architecture Notes directories and copies bundled templates without overwriting user files.
 *
 * @param input - Extension resource location and scoped workspace options.
 * @returns The initialized directory or a skipped result when an existing output directory is required.
 *
 * @example
 * await initializeArchitectureNotesService({
 *   extensionUri: context.extensionUri,
 *   resource: workspaceFolder.uri,
 *   requireExistingOutputDirectory: true,
 * });
 */
export async function initializeArchitectureNotesService(
  input: InitializeArchitectureNotesInput,
): Promise<ArchitectureNotesInitializationResult> {
  const resolvedRoot = resolveCzazaRootDirectory(input.resource);
  const settings = getCzazaSettings(input.resource);
  const outputDirectory = path.resolve(resolvedRoot.rootDirectory, settings.outputDirectory);

  if (input.requireExistingOutputDirectory && !(await isDirectory(outputDirectory))) {
    return { kind: "skipped", reason: "outputDirectoryMissing" };
  }

  const architectureNotesDirectory = path.join(outputDirectory, ARCHITECTURE_NOTES_DIRECTORY);
  const templatesDirectory = path.join(
    input.extensionUri.fsPath,
    "resources",
    ARCHITECTURE_NOTES_DIRECTORY,
  );

  await mkdir(path.join(architectureNotesDirectory, DIAGRAMS_DIRECTORY), { recursive: true });

  for (const templateFile of TEMPLATE_FILES) {
    await copyFileIfMissing(
      path.join(templatesDirectory, templateFile),
      path.join(architectureNotesDirectory, templateFile),
    );
  }

  return { kind: "initialized", architectureNotesDirectory };
}

/**
 * Checks whether a path currently points to a directory.
 *
 * @param directoryPath - Absolute path to inspect.
 * @returns True when the path exists and is a directory.
 */
async function isDirectory(directoryPath: string): Promise<boolean> {
  try {
    return (await stat(directoryPath)).isDirectory();
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return false;
    }

    throw error;
  }
}

/**
 * Copies one bundled template only when the destination does not exist.
 *
 * @param sourcePath - Absolute bundled-template path.
 * @param destinationPath - Absolute user-file path.
 * @returns Promise resolved after copying or preserving an existing destination.
 */
async function copyFileIfMissing(sourcePath: string, destinationPath: string): Promise<void> {
  try {
    await copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL);
  } catch (error) {
    if (!isNodeError(error, "EEXIST")) {
      throw error;
    }
  }
}

/**
 * Checks an unknown error for one Node.js filesystem error code.
 *
 * @param error - Unknown caught value.
 * @param code - Expected filesystem error code.
 * @returns True when the value carries the expected code.
 */
function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
