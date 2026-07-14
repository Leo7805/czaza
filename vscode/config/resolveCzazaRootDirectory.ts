/**
 * Resolves the VS Code workspace root where CZaza features are enabled.
 */

import { statSync } from "node:fs";
import * as path from "node:path";

import * as vscode from "vscode";

import { getCzazaSettings } from "./czazaSettings";

/**
 * Fully resolved CZaza root directory details.
 */
export type ResolvedCzazaRootDirectory = {
  /**
   * Absolute path of the VS Code workspace folder used as the base directory.
   */
  workspaceFolderPath: string;

  /**
   * Absolute path where CZaza analysis, checks, and notes are enabled.
   */
  rootDirectory: string;

  /**
   * Raw configured root directory after trimming whitespace.
   *
   * Empty string means the workspace folder is used directly.
   */
  configuredRootDirectory: string;

  /**
   * Whether the root directory came from an explicit user setting.
   */
  isConfigured: boolean;
};

/**
 * Resolves the active CZaza root directory from VS Code settings.
 *
 * A configured relative root is resolved from the current resource's workspace
 * folder. If no resource is provided, the first VS Code workspace folder is
 * used as the default base.
 *
 * @param resource - Optional resource used to select scoped settings and the workspace folder.
 * @returns Resolved workspace folder and CZaza root directory paths.
 * @throws When VS Code has no workspace folder or the resolved root is not a directory.
 *
 * @example
 * const resolved = resolveCzazaRootDirectory(vscode.window.activeTextEditor?.document.uri);
 * console.log(resolved.rootDirectory);
 */
export function resolveCzazaRootDirectory(resource?: vscode.Uri): ResolvedCzazaRootDirectory {
  const workspaceFolder = resolveWorkspaceFolder(resource);
  const workspaceFolderPath = normalizeAbsolutePath(workspaceFolder.uri.fsPath);
  const configuredRootDirectory = getCzazaSettings(resource).rootDirectory;
  const rootDirectory = normalizeAbsolutePath(
    configuredRootDirectory
      ? resolveConfiguredRootDirectory(workspaceFolderPath, configuredRootDirectory)
      : workspaceFolderPath,
  );

  assertDirectory(rootDirectory);

  return {
    workspaceFolderPath,
    rootDirectory,
    configuredRootDirectory,
    isConfigured: configuredRootDirectory.length > 0,
  };
}

/**
 * Creates a CZaza-root-relative source path for a local file URI.
 *
 * @param uri - Local file URI to convert.
 * @param rootDirectory - Absolute CZaza root directory.
 * @returns Normalized path relative to the CZaza root, using `/` separators.
 * @throws When the URI is not a local file or is outside the CZaza root.
 *
 * @example
 * const sourcePath = getCzazaRelativePath(document.uri, resolved.rootDirectory);
 */
export function getCzazaRelativePath(uri: vscode.Uri, rootDirectory: string): string {
  if (uri.scheme !== "file") {
    throw new Error("CZaza can only create relative paths for local file documents.");
  }

  const relativePath = path.relative(normalizeAbsolutePath(rootDirectory), normalizeAbsolutePath(uri.fsPath));

  if (isOutsideRoot(relativePath)) {
    throw new Error("The selected file is outside the configured CZaza root directory.");
  }

  return normalizeRelativePath(relativePath);
}

/**
 * Checks whether a URI points to a local file inside the configured CZaza root.
 *
 * @param uri - URI to check.
 * @param rootDirectory - Absolute CZaza root directory.
 * @returns True when the URI is a local file inside the CZaza root.
 *
 * @example
 * if (isUriInsideCzazaRoot(document.uri, resolved.rootDirectory)) {
 *   // Run CZaza checks for this document.
 * }
 */
export function isUriInsideCzazaRoot(uri: vscode.Uri, rootDirectory: string): boolean {
  if (uri.scheme !== "file") {
    return false;
  }

  const relativePath = path.relative(normalizeAbsolutePath(rootDirectory), normalizeAbsolutePath(uri.fsPath));

  return !isOutsideRoot(relativePath);
}

function resolveWorkspaceFolder(resource?: vscode.Uri): vscode.WorkspaceFolder {
  const resourceWorkspaceFolder = resource ? vscode.workspace.getWorkspaceFolder(resource) : undefined;
  const workspaceFolder = resourceWorkspaceFolder ?? vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    throw new Error("CZaza requires an open VS Code workspace folder.");
  }

  return workspaceFolder;
}

function resolveConfiguredRootDirectory(workspaceFolderPath: string, configuredRootDirectory: string): string {
  return path.isAbsolute(configuredRootDirectory)
    ? configuredRootDirectory
    : path.resolve(workspaceFolderPath, configuredRootDirectory);
}

function assertDirectory(directoryPath: string): void {
  try {
    if (!statSync(directoryPath).isDirectory()) {
      throw new Error(`CZaza root directory is not a directory: ${directoryPath}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CZaza root directory")) {
      throw error;
    }

    throw new Error(`CZaza root directory does not exist: ${directoryPath}`);
  }
}

function isOutsideRoot(relativePath: string): boolean {
  return relativePath === "" ? false : relativePath.startsWith("..") || path.isAbsolute(relativePath);
}

function normalizeAbsolutePath(filePath: string): string {
  return path.resolve(filePath);
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}
