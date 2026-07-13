/**
 * Coordinates workspace note confirmation operations.
 */

import type { LineRange } from "@shared/models/common";
import type { ProgrammingLanguage, StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  confirmFileSource as confirmStoredFileSource,
  confirmLineCurrentText as confirmStoredLineCurrentText,
  confirmLineNumber as confirmStoredLineNumber,
  confirmSectionCurrentRange as confirmStoredSectionCurrentRange,
  confirmSectionRange as confirmStoredSectionRange,
} from "@shared/services/notes/noteConfirmationService";

/**
 * Dependencies required by workspace note confirmation helpers.
 *
 * @example
 * const deps: WorkspaceNoteConfirmationDependencies = { updateStoredSourceFile };
 */
export type WorkspaceNoteConfirmationDependencies = {
  /** Applies one stored source file update and persists the result. */
  updateStoredSourceFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    now: string,
    update: (sourceFile: StoredSourceFile) => StoredSourceFile,
  ): Promise<StoredSourceFile>;
};

/**
 * Confirms current source text as the file-level baseline.
 *
 * @param deps - Manager-like dependencies for source-file persistence.
 * @param workspaceRoot - Absolute workspace root path.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @param relativeFilePath - Normalized workspace-relative source file path.
 * @param sourceText - Current full source text.
 * @param programmingLanguage - Current VS Code TextDocument.languageId, when available.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = await confirmFileSource(deps, root, ".czaza", "src/index.ts", sourceText, "typescript", now);
 */
export function confirmFileSource(
  deps: WorkspaceNoteConfirmationDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  sourceText: string,
  programmingLanguage: ProgrammingLanguage | undefined,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => confirmStoredFileSource(sourceFile, sourceText, programmingLanguage, now),
  );
}

/**
 * Confirms a section note against its currently stored range.
 *
 * @param deps - Manager-like dependencies for source-file persistence.
 * @param workspaceRoot - Absolute workspace root path.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @param relativeFilePath - Normalized workspace-relative source file path.
 * @param sectionId - Stable section note id.
 * @param sourceText - Current full source text.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = await confirmSectionCurrentRange(deps, root, ".czaza", "src/index.ts", "section:1", sourceText, now);
 */
export function confirmSectionCurrentRange(
  deps: WorkspaceNoteConfirmationDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  sectionId: string,
  sourceText: string,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => confirmStoredSectionCurrentRange(sourceFile, sectionId, sourceText, now),
  );
}

/**
 * Confirms a section note against a new source range.
 *
 * @param deps - Manager-like dependencies for source-file persistence.
 * @param workspaceRoot - Absolute workspace root path.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @param relativeFilePath - Normalized workspace-relative source file path.
 * @param sectionId - Stable section note id.
 * @param range - One-based inclusive range to confirm.
 * @param sourceText - Current full source text.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = await confirmSectionRange(deps, root, ".czaza", "src/index.ts", "section:1", { startLine: 2, endLine: 4 }, sourceText, now);
 */
export function confirmSectionRange(
  deps: WorkspaceNoteConfirmationDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  sectionId: string,
  range: LineRange,
  sourceText: string,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => confirmStoredSectionRange(sourceFile, sectionId, range, sourceText, now),
  );
}

/**
 * Confirms a line note against its currently stored line number.
 *
 * @param deps - Manager-like dependencies for source-file persistence.
 * @param workspaceRoot - Absolute workspace root path.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @param relativeFilePath - Normalized workspace-relative source file path.
 * @param lineId - Stable line note id.
 * @param sourceText - Current full source text.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = await confirmLineCurrentText(deps, root, ".czaza", "src/index.ts", "line:1", sourceText, now);
 */
export function confirmLineCurrentText(
  deps: WorkspaceNoteConfirmationDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  lineId: string,
  sourceText: string,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => confirmStoredLineCurrentText(sourceFile, lineId, sourceText, now),
  );
}

/**
 * Confirms a line note against a new source line number.
 *
 * @param deps - Manager-like dependencies for source-file persistence.
 * @param workspaceRoot - Absolute workspace root path.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @param relativeFilePath - Normalized workspace-relative source file path.
 * @param lineId - Stable line note id.
 * @param line - One-based source line number to confirm.
 * @param sourceText - Current full source text.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = await confirmLineNumber(deps, root, ".czaza", "src/index.ts", "line:1", 4, sourceText, now);
 */
export function confirmLineNumber(
  deps: WorkspaceNoteConfirmationDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  lineId: string,
  line: number,
  sourceText: string,
  now: string,
): Promise<StoredSourceFile> {
  return deps.updateStoredSourceFile(
    workspaceRoot,
    outputDirectory,
    relativeFilePath,
    now,
    (sourceFile) => confirmStoredLineNumber(sourceFile, lineId, line, sourceText, now),
  );
}
