/**
 * Provides fine-grained workspace note metadata, status, anchor, and content updates.
 */

import type { AIExplanation } from "@shared/models/ai/common";
import type { LineRange } from "@shared/models/common";
import type { NoteStatus } from "@shared/models/domain/common";
import type { ProgrammingLanguage, StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  markSourceFileNotesCurrentConfirmed,
  markSourceFileNotesStale,
  updateFileAiExplanation,
  updateFileNoteStatus,
  updateFileUserNote,
  updateLineAiExplanation,
  updateLineAnchorText,
  updateLineNoteStatus,
  updateLineNumber,
  updateLineUserNote,
  updateProgrammingLanguage,
  updateSectionAiExplanation,
  updateSectionAnchorHash,
  updateSectionKind,
  updateSectionNoteStatus,
  updateSectionRange,
  updateSectionTitle,
  updateSectionUserNote,
  updateSourceHash,
} from "./workspaceNoteStoreUpdates";
import { WorkspaceNoteStoreCache } from "./WorkspaceNoteStoreCache";

/**
 * Coordinates fine-grained source-file note updates using the shared note store cache.
 *
 * @example
 * const manager = new WorkspaceNoteUpdateManager(cache);
 * const next = await manager.updateSourceHash(root, ".czaza", "src/index.ts", "sha256:abc", now);
 */
export class WorkspaceNoteUpdateManager {
  private readonly cache: WorkspaceNoteStoreCache;

  /**
   * Creates a workspace note update manager.
   *
   * @param cache - Shared note store cache.
   *
   * @example
   * const manager = new WorkspaceNoteUpdateManager(cache);
   */
  constructor(cache: WorkspaceNoteStoreCache) {
    this.cache = cache;
  }

  /**
   * Updates the stored source hash for one source file.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sourceHash - Current source content hash.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.updateSourceHash(root, ".czaza", "src/index.ts", "sha256:abc", now);
   */
  updateSourceHash(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceHash: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return updateSourceHash(this.cache, workspaceRoot, outputDirectory, relativeFilePath, sourceHash, now);
  }

  /**
   * Updates the stored VS Code language id for one source file.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param programmingLanguage - VS Code TextDocument.languageId, when available.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.updateProgrammingLanguage(root, ".czaza", "src/index.ts", "typescriptreact", now);
   */
  updateProgrammingLanguage(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    programmingLanguage: ProgrammingLanguage | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return updateProgrammingLanguage(this.cache, workspaceRoot, outputDirectory, relativeFilePath, programmingLanguage, now);
  }

  /**
   * Updates the file-level note status.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param status - Next file note status.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.updateFileNoteStatus(root, ".czaza", "src/index.ts", status, now);
   */
  updateFileNoteStatus(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    status: NoteStatus,
    now: string,
  ): Promise<StoredSourceFile> {
    return updateFileNoteStatus(this.cache, workspaceRoot, outputDirectory, relativeFilePath, status, now);
  }

  /**
   * Updates one section note status.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sectionId - Stable section note id.
   * @param status - Next section note status.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.updateSectionNoteStatus(root, ".czaza", "src/index.ts", "section:1", status, now);
   */
  updateSectionNoteStatus(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    status: NoteStatus,
    now: string,
  ): Promise<StoredSourceFile> {
    return updateSectionNoteStatus(this.cache, workspaceRoot, outputDirectory, relativeFilePath, sectionId, status, now);
  }

  /**
   * Updates one line note status.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param lineId - Stable line note id.
   * @param status - Next line note status.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.updateLineNoteStatus(root, ".czaza", "src/index.ts", "line:1", status, now);
   */
  updateLineNoteStatus(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    status: NoteStatus,
    now: string,
  ): Promise<StoredSourceFile> {
    return updateLineNoteStatus(this.cache, workspaceRoot, outputDirectory, relativeFilePath, lineId, status, now);
  }

  /**
   * Marks every existing note in one source file as stale.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.markSourceFileNotesStale(root, ".czaza", "src/index.ts", now);
   */
  markSourceFileNotesStale(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return markSourceFileNotesStale(this.cache, workspaceRoot, outputDirectory, relativeFilePath, now);
  }

  /**
   * Marks every existing note in one source file as current and confirmed.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.markSourceFileNotesCurrentConfirmed(root, ".czaza", "src/index.ts", now);
   */
  markSourceFileNotesCurrentConfirmed(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return markSourceFileNotesCurrentConfirmed(this.cache, workspaceRoot, outputDirectory, relativeFilePath, now);
  }

  /**
   * Updates one section note source range.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sectionId - Stable section note id.
   * @param range - Next one-based inclusive source range.
   * @param lineCount - Current source file line count.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.updateSectionRange(root, ".czaza", "src/index.ts", "section:1", { startLine: 1, endLine: 3 }, 20, now);
   */
  updateSectionRange(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    range: LineRange,
    lineCount: number,
    now: string,
  ): Promise<StoredSourceFile> {
    return updateSectionRange(this.cache, workspaceRoot, outputDirectory, relativeFilePath, sectionId, range, lineCount, now);
  }

  /**
   * Updates one section note anchor hash.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sectionId - Stable section note id.
   * @param anchorHash - Current hash for the section source range.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.updateSectionAnchorHash(root, ".czaza", "src/index.ts", "section:1", "sha256:abc", now);
   */
  updateSectionAnchorHash(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    anchorHash: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return updateSectionAnchorHash(this.cache, workspaceRoot, outputDirectory, relativeFilePath, sectionId, anchorHash, now);
  }

  /**
   * Updates one line note source line.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param lineId - Stable line note id.
   * @param line - Next one-based source line.
   * @param lineCount - Current source file line count.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.updateLineNumber(root, ".czaza", "src/index.ts", "line:1", 3, 20, now);
   */
  updateLineNumber(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    line: number,
    lineCount: number,
    now: string,
  ): Promise<StoredSourceFile> {
    return updateLineNumber(this.cache, workspaceRoot, outputDirectory, relativeFilePath, lineId, line, lineCount, now);
  }

  /**
   * Updates one line note anchor text.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param lineId - Stable line note id.
   * @param anchorText - Current source text for the line anchor.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.updateLineAnchorText(root, ".czaza", "src/index.ts", "line:1", "const value = 1;", now);
   */
  updateLineAnchorText(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    anchorText: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return updateLineAnchorText(this.cache, workspaceRoot, outputDirectory, relativeFilePath, lineId, anchorText, now);
  }

  /**
   * Updates the file-level user note.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param userNote - Next user note content, or undefined to remove it.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.updateFileUserNote(root, ".czaza", "src/index.ts", "Remember this.", now);
   */
  updateFileUserNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    userNote: string | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return updateFileUserNote(this.cache, workspaceRoot, outputDirectory, relativeFilePath, userNote, now);
  }

  /**
   * Updates one section note user note.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sectionId - Stable section note id.
   * @param userNote - Next user note content, or undefined to remove it.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.updateSectionUserNote(root, ".czaza", "src/index.ts", "section:1", "Review this.", now);
   */
  updateSectionUserNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    userNote: string | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return updateSectionUserNote(this.cache, workspaceRoot, outputDirectory, relativeFilePath, sectionId, userNote, now);
  }

  /**
   * Updates one line note user note.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param lineId - Stable line note id.
   * @param userNote - Next user note content, or undefined to remove it.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.updateLineUserNote(root, ".czaza", "src/index.ts", "line:1", "Important.", now);
   */
  updateLineUserNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    userNote: string | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return updateLineUserNote(this.cache, workspaceRoot, outputDirectory, relativeFilePath, lineId, userNote, now);
  }

  /**
   * Updates the file-level AI explanation.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param aiExplanation - Next AI explanation, or undefined to remove it.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.updateFileAiExplanation(root, ".czaza", "src/index.ts", explanation, now);
   */
  updateFileAiExplanation(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    aiExplanation: AIExplanation | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return updateFileAiExplanation(this.cache, workspaceRoot, outputDirectory, relativeFilePath, aiExplanation, now);
  }

  /**
   * Updates one section note AI explanation.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sectionId - Stable section note id.
   * @param aiExplanation - Next AI explanation, or undefined to remove it.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.updateSectionAiExplanation(root, ".czaza", "src/index.ts", "section:1", explanation, now);
   */
  updateSectionAiExplanation(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    aiExplanation: AIExplanation | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return updateSectionAiExplanation(this.cache, workspaceRoot, outputDirectory, relativeFilePath, sectionId, aiExplanation, now);
  }

  /**
   * Updates one line note AI explanation.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param lineId - Stable line note id.
   * @param aiExplanation - Next AI explanation, or undefined to remove it.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.updateLineAiExplanation(root, ".czaza", "src/index.ts", "line:1", explanation, now);
   */
  updateLineAiExplanation(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    aiExplanation: AIExplanation | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return updateLineAiExplanation(this.cache, workspaceRoot, outputDirectory, relativeFilePath, lineId, aiExplanation, now);
  }

  /**
   * Updates one section note title.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sectionId - Stable section note id.
   * @param title - Next section title.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.updateSectionTitle(root, ".czaza", "src/index.ts", "section:1", "Setup", now);
   */
  updateSectionTitle(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    title: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return updateSectionTitle(this.cache, workspaceRoot, outputDirectory, relativeFilePath, sectionId, title, now);
  }

  /**
   * Updates one section note kind.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sectionId - Stable section note id.
   * @param kind - Next section kind, or undefined to remove it.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.updateSectionKind(root, ".czaza", "src/index.ts", "section:1", "setup", now);
   */
  updateSectionKind(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    kind: string | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return updateSectionKind(this.cache, workspaceRoot, outputDirectory, relativeFilePath, sectionId, kind, now);
  }
}
