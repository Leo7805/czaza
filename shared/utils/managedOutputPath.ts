/**
 * Path guards for files owned by CZaza's generated output directory.
 */

import * as path from "node:path";

/**
 * Returns whether a root-relative resource is the configured output directory
 * itself or one of its descendants.
 */
export function isCzazaManagedRelativePath(
  workspaceRoot: string,
  outputDirectory: string,
  relativePath: string,
): boolean {
  const outputRoot = path.resolve(workspaceRoot, outputDirectory);
  const candidate = path.resolve(workspaceRoot, relativePath);
  const relativeToOutput = path.relative(outputRoot, candidate);

  return (
    relativeToOutput === "" ||
    (!relativeToOutput.startsWith("..") && !path.isAbsolute(relativeToOutput))
  );
}

/** Returns whether one path is equal to or contained by a directory path. */
export function isPathInsideDirectory(candidatePath: string, directoryPath: string): boolean {
  const relativePath = path.relative(path.resolve(directoryPath), path.resolve(candidatePath));

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}
