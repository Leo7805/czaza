/**
 * Provides workspace note detection and detection-status application operations.
 */

import {
  type ChangedSourceRangeNoteDetectionOptions,
  type SourceFileNoteDetectionOptions,
} from "@shared/services/notes/noteDetectionService";
import {
  checkAndApplyChangedSourceRangeNoteStatus,
  checkAndApplyEntireSourceFileNoteStatus,
  checkChangedSourceRangeNotes,
  checkEntireSourceFileNotes,
} from "./workspaceNoteStoreDetection";
import { WorkspaceNoteStoreCache } from "./WorkspaceNoteStoreCache";
import type {
  SourceFileNoteCheckResult,
  SourceFileNoteStatusApplyResult,
} from "./WorkspaceNoteStoreTypes";

/**
 * Coordinates source-file note detection using the shared note store cache.
 *
 * @example
 * const manager = new WorkspaceNoteDetectionManager(cache);
 * const result = await manager.checkEntireSourceFileNotes(root, ".czaza", "src/index.ts", sourceText);
 */
export class WorkspaceNoteDetectionManager {
  private readonly cache: WorkspaceNoteStoreCache;

  /**
   * Creates a workspace note detection manager.
   *
   * @param cache - Shared note store cache.
   *
   * @example
   * const manager = new WorkspaceNoteDetectionManager(cache);
   */
  constructor(cache: WorkspaceNoteStoreCache) {
    this.cache = cache;
  }

  /**
   * Checks every note for the current source file against current source text.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sourceText - Current full source text.
   * @param options - Optional current source metadata.
   * @returns Detection result, or a missing/corrupt note-store state.
   *
   * @example
   * const result = await manager.checkSourceFileNotes(root, ".czaza", "src/index.ts", sourceText);
   */
  async checkSourceFileNotes(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceText: string,
    options: SourceFileNoteDetectionOptions = {},
  ): Promise<SourceFileNoteCheckResult> {
    return this.checkEntireSourceFileNotes(workspaceRoot, outputDirectory, relativeFilePath, sourceText, options);
  }

  /**
   * Checks every note for the current source file against current source text.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sourceText - Current full source text.
   * @param options - Optional current source metadata.
   * @returns Detection result, or a missing/corrupt note-store state.
   *
   * @example
   * const result = await manager.checkEntireSourceFileNotes(root, ".czaza", "src/index.ts", sourceText);
   */
  async checkEntireSourceFileNotes(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceText: string,
    options: SourceFileNoteDetectionOptions = {},
  ): Promise<SourceFileNoteCheckResult> {
    return checkEntireSourceFileNotes(this.cache, workspaceRoot, outputDirectory, relativeFilePath, sourceText, options);
  }

  /**
   * Checks notes affected by a source change that starts at a specific line.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sourceText - Current full source text.
   * @param options - Changed range and optional current source metadata.
   * @returns Detection result, or a missing/corrupt note-store state.
   *
   * @example
   * const result = await manager.checkChangedSourceRangeNotes(root, ".czaza", "src/index.ts", sourceText, { changedStartLine: 20 });
   */
  async checkChangedSourceRangeNotes(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceText: string,
    options: ChangedSourceRangeNoteDetectionOptions,
  ): Promise<SourceFileNoteCheckResult> {
    return checkChangedSourceRangeNotes(this.cache, workspaceRoot, outputDirectory, relativeFilePath, sourceText, options);
  }

  /**
   * Checks every note for one source file and persists suggested statuses.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sourceText - Current full source text.
   * @param options - Optional current source metadata.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Apply result, or a missing/corrupt note-store state.
   *
   * @example
   * const result = await manager.checkAndApplyEntireSourceFileNoteStatus(root, ".czaza", "src/index.ts", sourceText, {}, now);
   */
  async checkAndApplyEntireSourceFileNoteStatus(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceText: string,
    options: SourceFileNoteDetectionOptions = {},
    now: string,
  ): Promise<SourceFileNoteStatusApplyResult> {
    return checkAndApplyEntireSourceFileNoteStatus(
      this.cache,
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      sourceText,
      options,
      now,
    );
  }

  /**
   * Checks notes affected by a changed source range and persists suggested statuses.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sourceText - Current full source text.
   * @param options - Changed range and optional current source metadata.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Apply result, or a missing/corrupt note-store state.
   *
   * @example
   * const result = await manager.checkAndApplyChangedSourceRangeNoteStatus(root, ".czaza", "src/index.ts", sourceText, { changedStartLine: 20 }, now);
   */
  async checkAndApplyChangedSourceRangeNoteStatus(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceText: string,
    options: ChangedSourceRangeNoteDetectionOptions,
    now: string,
  ): Promise<SourceFileNoteStatusApplyResult> {
    return checkAndApplyChangedSourceRangeNoteStatus(
      this.cache,
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      sourceText,
      options,
      now,
    );
  }
}
