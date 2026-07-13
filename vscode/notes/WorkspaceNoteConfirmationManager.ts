/**
 * Provides workspace note anchor confirmation operations.
 */

import type { LineRange } from "@shared/models/common";
import type { ProgrammingLanguage, StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  confirmFileSource,
  confirmLineCurrentText,
  confirmLineNumber,
  confirmSectionCurrentRange,
  confirmSectionRange,
} from "./workspaceNoteStoreConfirmation";
import { WorkspaceNoteStoreCache } from "./WorkspaceNoteStoreCache";

/**
 * Coordinates user confirmation updates using the shared note store cache.
 *
 * @example
 * const manager = new WorkspaceNoteConfirmationManager(cache);
 * const next = await manager.confirmFileSource(root, ".czaza", "src/index.ts", sourceText, "typescript", now);
 */
export class WorkspaceNoteConfirmationManager {
  private readonly cache: WorkspaceNoteStoreCache;

  /**
   * Creates a workspace note confirmation manager.
   *
   * @param cache - Shared note store cache.
   *
   * @example
   * const manager = new WorkspaceNoteConfirmationManager(cache);
   */
  constructor(cache: WorkspaceNoteStoreCache) {
    this.cache = cache;
  }

  /**
   * Confirms the current source text as the file-level baseline.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sourceText - Current full source text.
   * @param programmingLanguage - Current VS Code TextDocument.languageId, when available.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.confirmFileSource(root, ".czaza", "src/index.ts", sourceText, "typescript", now);
   */
  confirmFileSource(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceText: string,
    programmingLanguage: ProgrammingLanguage | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return confirmFileSource(this.cache, workspaceRoot, outputDirectory, relativeFilePath, sourceText, programmingLanguage, now);
  }

  /**
   * Confirms a section note against its currently stored range.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sectionId - Stable section note id.
   * @param sourceText - Current full source text.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.confirmSectionCurrentRange(root, ".czaza", "src/index.ts", "section:1", sourceText, now);
   */
  confirmSectionCurrentRange(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    sourceText: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return confirmSectionCurrentRange(this.cache, workspaceRoot, outputDirectory, relativeFilePath, sectionId, sourceText, now);
  }

  /**
   * Confirms a section note against a new source range.
   *
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
   * const next = await manager.confirmSectionRange(root, ".czaza", "src/index.ts", "section:1", { startLine: 2, endLine: 4 }, sourceText, now);
   */
  confirmSectionRange(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    range: LineRange,
    sourceText: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return confirmSectionRange(this.cache, workspaceRoot, outputDirectory, relativeFilePath, sectionId, range, sourceText, now);
  }

  /**
   * Confirms a line note against its currently stored line number.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param lineId - Stable line note id.
   * @param sourceText - Current full source text.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.confirmLineCurrentText(root, ".czaza", "src/index.ts", "line:1", sourceText, now);
   */
  confirmLineCurrentText(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    sourceText: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return confirmLineCurrentText(this.cache, workspaceRoot, outputDirectory, relativeFilePath, lineId, sourceText, now);
  }

  /**
   * Confirms a line note against a new source line number.
   *
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
   * const next = await manager.confirmLineNumber(root, ".czaza", "src/index.ts", "line:1", 4, sourceText, now);
   */
  confirmLineNumber(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    line: number,
    sourceText: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return confirmLineNumber(this.cache, workspaceRoot, outputDirectory, relativeFilePath, lineId, line, sourceText, now);
  }
}
