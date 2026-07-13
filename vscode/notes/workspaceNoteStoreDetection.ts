/**
 * Coordinates workspace note detection and detection-status persistence.
 */

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import type { WorkspaceNoteIndexV1 } from "@shared/models/store/workspace";
import {
  detectChangedSourceRangeNotes,
  detectEntireSourceFileNotes,
  type ChangedSourceRangeNoteDetectionOptions,
  type SourceFileNoteDetectionOptions,
} from "@shared/services/notes/noteDetectionService";
import { applySourceFileNoteDetectionReport } from "@shared/services/notes/noteDetectionApplyService";
import type {
  SourceFileNoteCheckResult,
  SourceFileNoteStatusApplyResult,
} from "./WorkspaceNoteStoreTypes";

/**
 * Dependencies required by workspace note detection helpers.
 *
 * @example
 * const deps: WorkspaceNoteDetectionDependencies = manager;
 */
export type WorkspaceNoteDetectionDependencies = {
  /** Loads the workspace note index. */
  loadIndex(workspaceRoot: string, outputDirectory: string): Promise<WorkspaceNoteIndexV1 | null>;

  /** Loads one stored source-file note JSON. */
  getSourceFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
  ): Promise<StoredSourceFile | undefined>;

  /** Saves one stored source-file note JSON. */
  saveSourceFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceFile: StoredSourceFile,
    now: string,
  ): Promise<void>;
};

/**
 * Internal result used while loading source-file notes before detection.
 *
 * @example
 * const result: TrackedSourceFileLookupResult = {
 *   kind: "tracked",
 *   relativeFilePath: "src/index.ts",
 *   sourceFile,
 * };
 */
type TrackedSourceFileLookupResult =
  | {
      /** Existing source file notes were found. */
      kind: "tracked";

      /** Normalized workspace-relative source file path. */
      relativeFilePath: string;

      /** Stored source-file notes to check. */
      sourceFile: StoredSourceFile;
    }
  | {
      /** The workspace index does not contain the current source path. */
      kind: "indexEntryMissing";

      /** Normalized workspace-relative source file path. */
      relativeFilePath: string;
    }
  | {
      /** The index entry exists, but the referenced note JSON is missing or invalid. */
      kind: "noteFileMissingOrInvalid";

      /** Normalized workspace-relative source file path. */
      relativeFilePath: string;
    };

/**
 * Checks every note for one source file against current source text.
 *
 * @param deps - Manager-like dependencies for index and source-file IO.
 * @param workspaceRoot - Absolute workspace root path.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @param relativeFilePath - Normalized workspace-relative source file path.
 * @param sourceText - Current full source text.
 * @param options - Optional current source metadata.
 * @returns Detection result, or a missing/corrupt note-store state.
 *
 * @example
 * const result = await checkEntireSourceFileNotes(deps, root, ".czaza", "src/index.ts", sourceText);
 */
export async function checkEntireSourceFileNotes(
  deps: WorkspaceNoteDetectionDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  sourceText: string,
  options: SourceFileNoteDetectionOptions = {},
): Promise<SourceFileNoteCheckResult> {
  const sourceFile = await getTrackedSourceFile(deps, workspaceRoot, outputDirectory, relativeFilePath);

  if (sourceFile.kind !== "tracked") {
    return sourceFile;
  }

  return {
    ...sourceFile,
    report: detectEntireSourceFileNotes(sourceText, sourceFile.sourceFile, options),
  };
}

/**
 * Checks notes affected by a source change that starts at a specific line.
 *
 * @param deps - Manager-like dependencies for index and source-file IO.
 * @param workspaceRoot - Absolute workspace root path.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @param relativeFilePath - Normalized workspace-relative source file path.
 * @param sourceText - Current full source text.
 * @param options - Changed range and optional current source metadata.
 * @returns Detection result, or a missing/corrupt note-store state.
 *
 * @example
 * const result = await checkChangedSourceRangeNotes(deps, root, ".czaza", "src/index.ts", sourceText, { changedStartLine: 20 });
 */
export async function checkChangedSourceRangeNotes(
  deps: WorkspaceNoteDetectionDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  sourceText: string,
  options: ChangedSourceRangeNoteDetectionOptions,
): Promise<SourceFileNoteCheckResult> {
  const sourceFile = await getTrackedSourceFile(deps, workspaceRoot, outputDirectory, relativeFilePath);

  if (sourceFile.kind !== "tracked") {
    return sourceFile;
  }

  return {
    ...sourceFile,
    report: detectChangedSourceRangeNotes(sourceText, sourceFile.sourceFile, options),
  };
}

/**
 * Checks every note for one source file and persists suggested statuses.
 *
 * @param deps - Manager-like dependencies for index and source-file IO.
 * @param workspaceRoot - Absolute workspace root path.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @param relativeFilePath - Normalized workspace-relative source file path.
 * @param sourceText - Current full source text.
 * @param options - Optional current source metadata.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Apply result, or a missing/corrupt note-store state.
 *
 * @example
 * const result = await checkAndApplyEntireSourceFileNoteStatus(deps, root, ".czaza", "src/index.ts", sourceText, {}, now);
 */
export async function checkAndApplyEntireSourceFileNoteStatus(
  deps: WorkspaceNoteDetectionDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  sourceText: string,
  options: SourceFileNoteDetectionOptions = {},
  now: string,
): Promise<SourceFileNoteStatusApplyResult> {
  const checked = await checkEntireSourceFileNotes(
    deps,
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    sourceText,
    options,
  );

  return applyCheckedSourceFileNoteStatus(deps, workspaceRoot, outputDirectory, relativeFilePath, checked, now);
}

/**
 * Checks notes affected by a changed source range and persists suggested statuses.
 *
 * @param deps - Manager-like dependencies for index and source-file IO.
 * @param workspaceRoot - Absolute workspace root path.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @param relativeFilePath - Normalized workspace-relative source file path.
 * @param sourceText - Current full source text.
 * @param options - Changed range and optional current source metadata.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Apply result, or a missing/corrupt note-store state.
 *
 * @example
 * const result = await checkAndApplyChangedSourceRangeNoteStatus(deps, root, ".czaza", "src/index.ts", sourceText, { changedStartLine: 20 }, now);
 */
export async function checkAndApplyChangedSourceRangeNoteStatus(
  deps: WorkspaceNoteDetectionDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  sourceText: string,
  options: ChangedSourceRangeNoteDetectionOptions,
  now: string,
): Promise<SourceFileNoteStatusApplyResult> {
  const checked = await checkChangedSourceRangeNotes(
    deps,
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    sourceText,
    options,
  );

  return applyCheckedSourceFileNoteStatus(deps, workspaceRoot, outputDirectory, relativeFilePath, checked, now);
}

/**
 * Applies and saves statuses from an existing source-file note check result.
 *
 * @param deps - Manager-like dependencies for source-file IO.
 * @param workspaceRoot - Absolute workspace root path.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @param relativeFilePath - Normalized workspace-relative source file path.
 * @param checked - Detection result to apply.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Apply result, or the original missing/corrupt note-store state.
 *
 * @example
 * const result = await applyCheckedSourceFileNoteStatus(deps, root, ".czaza", "src/index.ts", checked, now);
 */
export async function applyCheckedSourceFileNoteStatus(
  deps: WorkspaceNoteDetectionDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  checked: SourceFileNoteCheckResult,
  now: string,
): Promise<SourceFileNoteStatusApplyResult> {
  if (checked.kind !== "tracked") {
    return checked;
  }

  const updatedSourceFile = applySourceFileNoteDetectionReport(checked.sourceFile, checked.report, now);

  await deps.saveSourceFile(workspaceRoot, outputDirectory, relativeFilePath, updatedSourceFile, now);

  return {
    kind: "tracked",
    relativeFilePath,
    sourceFile: checked.sourceFile,
    updatedSourceFile,
    report: checked.report,
  };
}

/**
 * Loads the tracked source file for a path before running detection.
 *
 * @param deps - Manager-like dependencies for index and source-file IO.
 * @param workspaceRoot - Absolute workspace root path.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @param relativeFilePath - Normalized workspace-relative source file path.
 * @returns Tracked source-file state or a missing/corrupt note-store state.
 *
 * @example
 * const result = await getTrackedSourceFile(deps, root, ".czaza", "src/index.ts");
 */
async function getTrackedSourceFile(
  deps: WorkspaceNoteDetectionDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
): Promise<TrackedSourceFileLookupResult> {
  const index = await deps.loadIndex(workspaceRoot, outputDirectory);

  if (!index?.files[relativeFilePath]) {
    return {
      kind: "indexEntryMissing",
      relativeFilePath,
    };
  }

  const sourceFile = await deps.getSourceFile(workspaceRoot, outputDirectory, relativeFilePath);

  if (!sourceFile) {
    return {
      kind: "noteFileMissingOrInvalid",
      relativeFilePath,
    };
  }

  return {
    kind: "tracked",
    relativeFilePath,
    sourceFile,
  };
}
