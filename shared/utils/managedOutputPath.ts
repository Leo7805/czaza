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
