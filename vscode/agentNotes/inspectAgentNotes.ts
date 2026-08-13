/**
 * Reads current source text and existing Team Notes for an AI Agent without writing data.
 */

import path from "node:path";
import { readFile } from "node:fs/promises";

import { createSourceHash } from "@shared/utils/hashUtils";
import {
  isCzazaNoteStoreRelativePath,
  isPathInsideDirectory,
} from "@shared/utils/managedOutputPath";
import { WorkspaceNoteStore } from "@vscode/notes";
import type {
  InspectAgentNotesInput,
  InspectAgentNotesResult,
  InspectedAgentNoteFile,
  SkippedAgentNoteInspection,
} from "./agentNoteTypes";

/**
 * Inspects current source files and their existing Team Notes.
 *
 * Invalid paths and unavailable Note Store entries are returned as skipped
 * items so one bad request does not prevent other files from being inspected.
 *
 * @param input - Workspace, output directory, and source paths to inspect.
 * @param notes - Shared Note Store instance used for cached reads.
 * @returns Inspected files and stable skip reasons in request order.
 */
export async function inspectAgentNotes(
  input: InspectAgentNotesInput,
  notes = new WorkspaceNoteStore(),
): Promise<InspectAgentNotesResult> {
  const files: InspectedAgentNoteFile[] = [];
  const skipped: SkippedAgentNoteInspection[] = [];
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const index = await notes.cache.loadIndex(workspaceRoot, input.outputDirectory);

  for (const requestedPath of input.sourcePaths) {
    const sourcePath = normalizeSourcePath(workspaceRoot, requestedPath);

    if (
      !sourcePath ||
      isCzazaNoteStoreRelativePath(workspaceRoot, input.outputDirectory, sourcePath)
    ) {
      skipped.push({ sourcePath: requestedPath, reason: "outsideWorkspace" });
      continue;
    }

    const absoluteSourcePath = path.resolve(workspaceRoot, sourcePath);
    let sourceText: string;

    try {
      sourceText = await readFile(absoluteSourcePath, "utf8");
    } catch {
      skipped.push({ sourcePath: requestedPath, reason: "sourceMissing" });
      continue;
    }

    if (!index) {
      skipped.push({ sourcePath, reason: "noteStoreInvalid" });
      continue;
    }

    if (!index.files[sourcePath]) {
      skipped.push({ sourcePath, reason: "notTracked" });
      continue;
    }

    const sourceFile = await notes.cache.getSourceFile(
      workspaceRoot,
      input.outputDirectory,
      sourcePath,
    );

    if (!sourceFile) {
      skipped.push({ sourcePath, reason: "noteStoreInvalid" });
      continue;
    }

    files.push({
      sourcePath,
      sourceText,
      sourceHash: createSourceHash(sourceText),
      storedSourceHash: sourceFile.source.sourceHash,
      notes: {
        ...(sourceFile.fileNote ? { file: sourceFile.fileNote } : {}),
        sections: sourceFile.sectionNotes,
        lines: sourceFile.lineNotes,
      },
    });
  }

  return { files, skipped };
}

/**
 * Converts a requested path to a safe workspace-relative POSIX path.
 *
 * @param workspaceRoot - Absolute project root used as the path boundary.
 * @param requestedPath - Caller-supplied relative source path.
 * @returns Normalized source path, or undefined when it escapes the root.
 */
function normalizeSourcePath(
  workspaceRoot: string,
  requestedPath: string,
): string | undefined {
  if (!requestedPath.trim() || path.isAbsolute(requestedPath)) {
    return undefined;
  }

  const absolutePath = path.resolve(workspaceRoot, requestedPath);

  if (!isPathInsideDirectory(absolutePath, workspaceRoot) || absolutePath === workspaceRoot) {
    return undefined;
  }

  return path.relative(workspaceRoot, absolutePath).split(path.sep).join("/");
}
