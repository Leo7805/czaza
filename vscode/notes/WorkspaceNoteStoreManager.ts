/**
 * Provides the main facade for workspace note store operations.
 */

import type { AIExplanation } from "@shared/models/ai/common";
import type { LineRange } from "@shared/models/common";
import type { NoteStatus } from "@shared/models/domain/common";
import type { StoredFileNote } from "@shared/models/store/file";
import type { StoredLineNote } from "@shared/models/store/line";
import type { StoredSectionNote } from "@shared/models/store/section";
import type { ProgrammingLanguage, StoredSourceFile } from "@shared/models/store/sourceFile";
import type { WorkspaceNoteIndexV1 } from "@shared/models/store/workspace";
import type {
  ChangedSourceRangeNoteDetectionOptions,
  SourceFileNoteDetectionOptions,
} from "@shared/services/notes/noteDetectionService";
import type {
  FileNoteUpsertInput,
  LineNoteUpsertInput,
  SectionNoteUpsertInput,
} from "@shared/services/notes/sourceFileNoteCrudService";
import { WorkspaceNoteConfirmationManager } from "./WorkspaceNoteConfirmationManager";
import { WorkspaceNoteCrudManager } from "./WorkspaceNoteCrudManager";
import { WorkspaceNoteDetectionManager } from "./WorkspaceNoteDetectionManager";
import { WorkspaceNoteSourceIndexManager } from "./WorkspaceNoteSourceIndexManager";
import { WorkspaceNoteStoreCache } from "./WorkspaceNoteStoreCache";
import { WorkspaceNoteStoreRepository } from "./WorkspaceNoteStoreRepository";
import type {
  SourceFileNoteCheckResult,
  SourceFileNoteStatusApplyResult,
} from "./WorkspaceNoteStoreTypes";
import { WorkspaceNoteUpdateManager } from "./WorkspaceNoteUpdateManager";

export type {
  SourceFileNoteCheckResult,
  SourceFileNoteStatusApplyResult,
} from "./WorkspaceNoteStoreTypes";

/**
 * Coordinates cache, persistence, detection, confirmation, update, and CRUD managers.
 *
 * @example
 * const manager = new WorkspaceNoteStoreManager();
 * const sourceFile = await manager.getSourceFile("/workspace/project", ".czaza", "src/index.ts");
 */
export class WorkspaceNoteStoreManager {
  private readonly cache: WorkspaceNoteStoreCache;
  private readonly confirmationManager: WorkspaceNoteConfirmationManager;
  private readonly crudManager: WorkspaceNoteCrudManager;
  private readonly detectionManager: WorkspaceNoteDetectionManager;
  private readonly sourceIndexManager: WorkspaceNoteSourceIndexManager;
  private readonly updateManager: WorkspaceNoteUpdateManager;

  /**
   * Creates a workspace note store manager.
   *
   * @param repository - Repository used for filesystem reads and writes.
   *
   * @example
   * const manager = new WorkspaceNoteStoreManager(new WorkspaceNoteStoreRepository());
   */
  constructor(repository = new WorkspaceNoteStoreRepository()) {
    this.cache = new WorkspaceNoteStoreCache(repository);
    this.confirmationManager = new WorkspaceNoteConfirmationManager(this.cache);
    this.crudManager = new WorkspaceNoteCrudManager(this.cache);
    this.detectionManager = new WorkspaceNoteDetectionManager(this.cache);
    this.sourceIndexManager = new WorkspaceNoteSourceIndexManager(this.cache);
    this.updateManager = new WorkspaceNoteUpdateManager(this.cache);
  }

  /**
   * Loads and caches the workspace note index.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @returns Workspace note index, or null when missing or invalid.
   *
   * @example
   * const index = await manager.loadIndex("/workspace/project", ".czaza");
   */
  loadIndex(workspaceRoot: string, outputDirectory: string): Promise<WorkspaceNoteIndexV1 | null> {
    return this.cache.loadIndex(workspaceRoot, outputDirectory);
  }

  /**
   * Clears cached state for one workspace/output directory pair.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   *
   * @example
   * manager.clearCache("/workspace/project", ".czaza");
   */
  clearCache(workspaceRoot: string, outputDirectory: string): void {
    this.cache.clearCache(workspaceRoot, outputDirectory);
  }

  /**
   * Reads and caches one stored source-file note JSON.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @returns Stored source file, or undefined when missing.
   *
   * @example
   * const sourceFile = await manager.getSourceFile("/workspace/project", ".czaza", "src/index.ts");
   */
  getSourceFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
  ): Promise<StoredSourceFile | undefined> {
    return this.cache.getSourceFile(workspaceRoot, outputDirectory, relativeFilePath);
  }

  /**
   * Saves and caches one stored source-file note JSON.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sourceFile - Stored source file to save.
   * @param now - ISO 8601 timestamp used for index updatedAt.
   * @returns Promise that resolves after saving.
   *
   * @example
   * await manager.saveSourceFile("/workspace/project", ".czaza", "src/index.ts", sourceFile, now);
   */
  saveSourceFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceFile: StoredSourceFile,
    now: string,
  ): Promise<void> {
    return this.cache.saveSourceFile(workspaceRoot, outputDirectory, relativeFilePath, sourceFile, now);
  }

  /**
   * Checks whether notes for the current source file still match current source text.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sourceText - Current full source text.
   * @param options - Optional current source metadata.
   * @returns Detection result, or a missing/corrupt note-store state.
   *
   * @example
   * const result = await manager.checkSourceFileNotes("/workspace/project", ".czaza", "src/index.ts", text);
   */
  checkSourceFileNotes(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceText: string,
    options: SourceFileNoteDetectionOptions = {},
  ): Promise<SourceFileNoteCheckResult> {
    return this.detectionManager.checkSourceFileNotes(workspaceRoot, outputDirectory, relativeFilePath, sourceText, options);
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
   * const result = await manager.checkEntireSourceFileNotes("/workspace/project", ".czaza", "src/index.ts", text);
   */
  checkEntireSourceFileNotes(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceText: string,
    options: SourceFileNoteDetectionOptions = {},
  ): Promise<SourceFileNoteCheckResult> {
    return this.detectionManager.checkEntireSourceFileNotes(workspaceRoot, outputDirectory, relativeFilePath, sourceText, options);
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
   * const result = await manager.checkChangedSourceRangeNotes("/workspace/project", ".czaza", "src/index.ts", text, { changedStartLine: 20 });
   */
  checkChangedSourceRangeNotes(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceText: string,
    options: ChangedSourceRangeNoteDetectionOptions,
  ): Promise<SourceFileNoteCheckResult> {
    return this.detectionManager.checkChangedSourceRangeNotes(workspaceRoot, outputDirectory, relativeFilePath, sourceText, options);
  }

  /**
   * Checks every note for one source file and persists the suggested statuses.
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
   * const result = await manager.checkAndApplyEntireSourceFileNoteStatus("/workspace/project", ".czaza", "src/index.ts", text, {}, now);
   */
  checkAndApplyEntireSourceFileNoteStatus(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceText: string,
    options: SourceFileNoteDetectionOptions = {},
    now: string,
  ): Promise<SourceFileNoteStatusApplyResult> {
    return this.detectionManager.checkAndApplyEntireSourceFileNoteStatus(workspaceRoot, outputDirectory, relativeFilePath, sourceText, options, now);
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
   * const result = await manager.checkAndApplyChangedSourceRangeNoteStatus("/workspace/project", ".czaza", "src/index.ts", text, { changedStartLine: 20 }, now);
   */
  checkAndApplyChangedSourceRangeNoteStatus(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceText: string,
    options: ChangedSourceRangeNoteDetectionOptions,
    now: string,
  ): Promise<SourceFileNoteStatusApplyResult> {
    return this.detectionManager.checkAndApplyChangedSourceRangeNoteStatus(workspaceRoot, outputDirectory, relativeFilePath, sourceText, options, now);
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
   * const next = await manager.confirmFileSource("/workspace/project", ".czaza", "src/index.ts", sourceText, "typescript", now);
   */
  confirmFileSource(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceText: string,
    programmingLanguage: ProgrammingLanguage | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.confirmationManager.confirmFileSource(workspaceRoot, outputDirectory, relativeFilePath, sourceText, programmingLanguage, now);
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
   * const next = await manager.confirmSectionCurrentRange("/workspace/project", ".czaza", "src/index.ts", "section:1", sourceText, now);
   */
  confirmSectionCurrentRange(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    sourceText: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.confirmationManager.confirmSectionCurrentRange(workspaceRoot, outputDirectory, relativeFilePath, sectionId, sourceText, now);
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
   * const next = await manager.confirmSectionRange("/workspace/project", ".czaza", "src/index.ts", "section:1", { startLine: 2, endLine: 4 }, sourceText, now);
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
    return this.confirmationManager.confirmSectionRange(workspaceRoot, outputDirectory, relativeFilePath, sectionId, range, sourceText, now);
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
   * const next = await manager.confirmLineCurrentText("/workspace/project", ".czaza", "src/index.ts", "line:1", sourceText, now);
   */
  confirmLineCurrentText(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    sourceText: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.confirmationManager.confirmLineCurrentText(workspaceRoot, outputDirectory, relativeFilePath, lineId, sourceText, now);
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
   * const next = await manager.confirmLineNumber("/workspace/project", ".czaza", "src/index.ts", "line:1", 4, sourceText, now);
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
    return this.confirmationManager.confirmLineNumber(workspaceRoot, outputDirectory, relativeFilePath, lineId, line, sourceText, now);
  }

  /**
   * Renames or moves one source-file note index entry.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param oldRelativePath - Existing normalized workspace-relative source file path.
   * @param newRelativePath - New normalized workspace-relative source file path.
   * @param now - ISO 8601 timestamp used for updatedAt.
   * @returns Updated workspace note index.
   *
   * @example
   * const index = await manager.renameSourceFileEntry("/workspace/project", ".czaza", "src/old.ts", "src/new.ts", now);
   */
  renameSourceFileEntry(
    workspaceRoot: string,
    outputDirectory: string,
    oldRelativePath: string,
    newRelativePath: string,
    now: string,
  ): Promise<WorkspaceNoteIndexV1> {
    return this.sourceIndexManager.renameSourceFileEntry(workspaceRoot, outputDirectory, oldRelativePath, newRelativePath, now);
  }

  /**
   * Removes one source-file note index entry.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param now - ISO 8601 timestamp used for updatedAt when an entry is removed.
   * @returns Updated workspace note index.
   *
   * @example
   * const index = await manager.deleteSourceFileEntry("/workspace/project", ".czaza", "src/old.ts", now);
   */
  deleteSourceFileEntry(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    now: string,
  ): Promise<WorkspaceNoteIndexV1> {
    return this.sourceIndexManager.deleteSourceFileEntry(workspaceRoot, outputDirectory, relativeFilePath, now);
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
   * const next = await manager.updateSourceHash("/workspace/project", ".czaza", "src/index.ts", "sha256:abc", now);
   */
  updateSourceHash(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceHash: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateManager.updateSourceHash(workspaceRoot, outputDirectory, relativeFilePath, sourceHash, now);
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
   * const next = await manager.updateProgrammingLanguage("/workspace/project", ".czaza", "src/index.ts", "typescriptreact", now);
   */
  updateProgrammingLanguage(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    programmingLanguage: ProgrammingLanguage | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateManager.updateProgrammingLanguage(workspaceRoot, outputDirectory, relativeFilePath, programmingLanguage, now);
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
   * const next = await manager.updateFileNoteStatus("/workspace/project", ".czaza", "src/index.ts", status, now);
   */
  updateFileNoteStatus(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    status: NoteStatus,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateManager.updateFileNoteStatus(workspaceRoot, outputDirectory, relativeFilePath, status, now);
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
   * const next = await manager.updateSectionNoteStatus("/workspace/project", ".czaza", "src/index.ts", "section:1", status, now);
   */
  updateSectionNoteStatus(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    status: NoteStatus,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateManager.updateSectionNoteStatus(workspaceRoot, outputDirectory, relativeFilePath, sectionId, status, now);
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
   * const next = await manager.updateLineNoteStatus("/workspace/project", ".czaza", "src/index.ts", "line:1", status, now);
   */
  updateLineNoteStatus(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    status: NoteStatus,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateManager.updateLineNoteStatus(workspaceRoot, outputDirectory, relativeFilePath, lineId, status, now);
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
   * const next = await manager.markSourceFileNotesStale("/workspace/project", ".czaza", "src/index.ts", now);
   */
  markSourceFileNotesStale(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateManager.markSourceFileNotesStale(workspaceRoot, outputDirectory, relativeFilePath, now);
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
   * const next = await manager.markSourceFileNotesCurrentConfirmed("/workspace/project", ".czaza", "src/index.ts", now);
   */
  markSourceFileNotesCurrentConfirmed(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateManager.markSourceFileNotesCurrentConfirmed(workspaceRoot, outputDirectory, relativeFilePath, now);
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
   * const next = await manager.updateSectionRange("/workspace/project", ".czaza", "src/index.ts", "section:1", { startLine: 1, endLine: 3 }, 20, now);
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
    return this.updateManager.updateSectionRange(workspaceRoot, outputDirectory, relativeFilePath, sectionId, range, lineCount, now);
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
   * const next = await manager.updateSectionAnchorHash("/workspace/project", ".czaza", "src/index.ts", "section:1", "sha256:abc", now);
   */
  updateSectionAnchorHash(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    anchorHash: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateManager.updateSectionAnchorHash(workspaceRoot, outputDirectory, relativeFilePath, sectionId, anchorHash, now);
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
   * const next = await manager.updateLineNumber("/workspace/project", ".czaza", "src/index.ts", "line:1", 3, 20, now);
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
    return this.updateManager.updateLineNumber(workspaceRoot, outputDirectory, relativeFilePath, lineId, line, lineCount, now);
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
   * const next = await manager.updateLineAnchorText("/workspace/project", ".czaza", "src/index.ts", "line:1", "const value = 1;", now);
   */
  updateLineAnchorText(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    anchorText: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateManager.updateLineAnchorText(workspaceRoot, outputDirectory, relativeFilePath, lineId, anchorText, now);
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
   * const next = await manager.updateFileUserNote("/workspace/project", ".czaza", "src/index.ts", "Remember this.", now);
   */
  updateFileUserNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    userNote: string | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateManager.updateFileUserNote(workspaceRoot, outputDirectory, relativeFilePath, userNote, now);
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
   * const next = await manager.updateSectionUserNote("/workspace/project", ".czaza", "src/index.ts", "section:1", "Review this.", now);
   */
  updateSectionUserNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    userNote: string | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateManager.updateSectionUserNote(workspaceRoot, outputDirectory, relativeFilePath, sectionId, userNote, now);
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
   * const next = await manager.updateLineUserNote("/workspace/project", ".czaza", "src/index.ts", "line:1", "Important.", now);
   */
  updateLineUserNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    userNote: string | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateManager.updateLineUserNote(workspaceRoot, outputDirectory, relativeFilePath, lineId, userNote, now);
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
   * const next = await manager.updateFileAiExplanation("/workspace/project", ".czaza", "src/index.ts", explanation, now);
   */
  updateFileAiExplanation(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    aiExplanation: AIExplanation | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateManager.updateFileAiExplanation(workspaceRoot, outputDirectory, relativeFilePath, aiExplanation, now);
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
   * const next = await manager.updateSectionAiExplanation("/workspace/project", ".czaza", "src/index.ts", "section:1", explanation, now);
   */
  updateSectionAiExplanation(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    aiExplanation: AIExplanation | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateManager.updateSectionAiExplanation(workspaceRoot, outputDirectory, relativeFilePath, sectionId, aiExplanation, now);
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
   * const next = await manager.updateLineAiExplanation("/workspace/project", ".czaza", "src/index.ts", "line:1", explanation, now);
   */
  updateLineAiExplanation(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    aiExplanation: AIExplanation | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateManager.updateLineAiExplanation(workspaceRoot, outputDirectory, relativeFilePath, lineId, aiExplanation, now);
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
   * const next = await manager.updateSectionTitle("/workspace/project", ".czaza", "src/index.ts", "section:1", "Setup", now);
   */
  updateSectionTitle(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    title: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateManager.updateSectionTitle(workspaceRoot, outputDirectory, relativeFilePath, sectionId, title, now);
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
   * const next = await manager.updateSectionKind("/workspace/project", ".czaza", "src/index.ts", "section:1", "setup", now);
   */
  updateSectionKind(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    kind: string | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateManager.updateSectionKind(workspaceRoot, outputDirectory, relativeFilePath, sectionId, kind, now);
  }

  /**
   * Reads the file-level note for one source file.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @returns Stored file note when present.
   *
   * @example
   * const note = await manager.getFileNote("/workspace/project", ".czaza", "src/index.ts");
   */
  getFileNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
  ): Promise<StoredFileNote | undefined> {
    return this.crudManager.getFileNote(workspaceRoot, outputDirectory, relativeFilePath);
  }

  /**
   * Inserts or updates the file-level note for one source file.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param fileNote - File note input before timestamps are finalized.
   * @param now - ISO 8601 timestamp used for updatedAt and new createdAt values.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.upsertFileNote("/workspace/project", ".czaza", "src/index.ts", note, now);
   */
  upsertFileNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    fileNote: FileNoteUpsertInput,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.crudManager.upsertFileNote(workspaceRoot, outputDirectory, relativeFilePath, fileNote, now);
  }

  /**
   * Deletes the file-level note for one source file.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param now - ISO 8601 timestamp used for index updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.deleteFileNote("/workspace/project", ".czaza", "src/index.ts", now);
   */
  deleteFileNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.crudManager.deleteFileNote(workspaceRoot, outputDirectory, relativeFilePath, now);
  }

  /**
   * Reads one section note by id.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sectionId - Stable section note id.
   * @returns Stored section note when found.
   *
   * @example
   * const note = await manager.getSectionNote("/workspace/project", ".czaza", "src/index.ts", "section:1");
   */
  getSectionNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
  ): Promise<StoredSectionNote | undefined> {
    return this.crudManager.getSectionNote(workspaceRoot, outputDirectory, relativeFilePath, sectionId);
  }

  /**
   * Inserts or updates one section note by id.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sectionNote - Section note input before timestamps are finalized.
   * @param now - ISO 8601 timestamp used for updatedAt and new createdAt values.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.upsertSectionNote("/workspace/project", ".czaza", "src/index.ts", note, now);
   */
  upsertSectionNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionNote: SectionNoteUpsertInput,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.crudManager.upsertSectionNote(workspaceRoot, outputDirectory, relativeFilePath, sectionNote, now);
  }

  /**
   * Deletes one section note by id.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param sectionId - Stable section note id.
   * @param now - ISO 8601 timestamp used for index updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.deleteSectionNote("/workspace/project", ".czaza", "src/index.ts", "section:1", now);
   */
  deleteSectionNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.crudManager.deleteSectionNote(workspaceRoot, outputDirectory, relativeFilePath, sectionId, now);
  }

  /**
   * Reads one line note by id.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param lineId - Stable line note id.
   * @returns Stored line note when found.
   *
   * @example
   * const note = await manager.getLineNote("/workspace/project", ".czaza", "src/index.ts", "line:1");
   */
  getLineNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
  ): Promise<StoredLineNote | undefined> {
    return this.crudManager.getLineNote(workspaceRoot, outputDirectory, relativeFilePath, lineId);
  }

  /**
   * Inserts or updates one line note by id.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param lineNote - Line note input before timestamps are finalized.
   * @param now - ISO 8601 timestamp used for updatedAt and new createdAt values.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.upsertLineNote("/workspace/project", ".czaza", "src/index.ts", note, now);
   */
  upsertLineNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineNote: LineNoteUpsertInput,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.crudManager.upsertLineNote(workspaceRoot, outputDirectory, relativeFilePath, lineNote, now);
  }

  /**
   * Deletes one line note by id.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param lineId - Stable line note id.
   * @param now - ISO 8601 timestamp used for index updatedAt.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await manager.deleteLineNote("/workspace/project", ".czaza", "src/index.ts", "line:1", now);
   */
  deleteLineNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.crudManager.deleteLineNote(workspaceRoot, outputDirectory, relativeFilePath, lineId, now);
  }
}
