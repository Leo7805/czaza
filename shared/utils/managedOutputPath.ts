/**
 * Path guards for the CZaza Note Store and other directory boundaries.
 */

import * as path from "node:path";

/**
 * Returns whether a root-relative resource is the CZaza Note Store directory
 * itself or one of its descendants.
 *
 * @param workspaceRoot - Absolute CZaza root directory.
 * @param outputDirectory - Configured CZaza output directory.
 * @param relativePath - CZaza-root-relative candidate resource path.
 * @returns True only for `<outputDirectory>/notes/**`.
 */
export function isCzazaNoteStoreRelativePath(
  workspaceRoot: string,
  outputDirectory: string,
  relativePath: string,
): boolean {
  const outputRoot = path.resolve(workspaceRoot, outputDirectory, "notes");
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
