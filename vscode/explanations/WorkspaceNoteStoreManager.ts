/**
 * Manages cached workspace note index and per-file note CRUD operations.
 */

import type { FileNoteUpsertInput, LineNoteUpsertInput, SectionNoteUpsertInput } from "@shared/services/notes/sourceFileNoteCrudService";
import type { AIExplanation } from "@shared/models/ai/common";
import type { LineRange } from "@shared/models/common";
import type { NoteStatus } from "@shared/models/domain/common";
import {
  deleteFileNote,
  deleteLineNote,
  deleteSectionNote,
  getFileNote,
  getLineNote,
  getSectionNote,
  upsertFileNote,
  upsertLineNote,
  upsertSectionNote,
} from "@shared/services/notes/sourceFileNoteCrudService";
import type { StoredFileNote } from "@shared/models/store/file";
import type { StoredLineNote } from "@shared/models/store/line";
import type { StoredSectionNote } from "@shared/models/store/section";
import type { ProgrammingLanguage, StoredSourceFile } from "@shared/models/store/sourceFile";
import type { WorkspaceNoteIndexV1 } from "@shared/models/store/workspace";
import {
  markSourceFileNotesCurrentConfirmed,
  markSourceFileNotesStale,
  updateFileNoteStatus,
  updateLineNoteStatus,
  updateSectionNoteStatus,
} from "@shared/services/notes/noteStatusService";
import {
  updateLineAnchorText,
  updateLineNumber,
  updateProgrammingLanguage,
  updateSectionAnchorHash,
  updateSectionRange,
  updateSourceHash,
} from "@shared/services/notes/noteAnchorService";
import {
  updateFileAiExplanation,
  updateFileUserNote,
  updateLineAiExplanation,
  updateLineUserNote,
  updateSectionAiExplanation,
  updateSectionKind,
  updateSectionTitle,
  updateSectionUserNote,
} from "@shared/services/notes/noteContentService";
import {
  deleteSourceFileEntry,
  renameSourceFileEntry,
} from "@shared/services/notes/noteIndexService";
import { WorkspaceNoteStoreRepository } from "./WorkspaceNoteStoreRepository";

/**
 * Coordinates repository IO, in-memory cache, and note-level CRUD operations.
 *
 * @example
 * const manager = new WorkspaceNoteStoreManager();
 * const sourceFile = await manager.getSourceFile("/workspace/project", ".czaza", "src/index.ts");
 */
export class WorkspaceNoteStoreManager {
  private readonly repository: WorkspaceNoteStoreRepository;
  private readonly indexCache = new Map<string, WorkspaceNoteIndexV1 | null>();
  private readonly sourceFileCache = new Map<string, StoredSourceFile | undefined>();

  /**
   * Creates a workspace note store manager.
   *
   * @param repository - Repository used for filesystem reads and writes.
   *
   * @example
   * const manager = new WorkspaceNoteStoreManager(new WorkspaceNoteStoreRepository());
   */
  constructor(repository = new WorkspaceNoteStoreRepository()) {
    this.repository = repository;
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
  async loadIndex(workspaceRoot: string, outputDirectory: string): Promise<WorkspaceNoteIndexV1 | null> {
    const key = getWorkspaceCacheKey(workspaceRoot, outputDirectory);

    if (!this.indexCache.has(key)) {
      this.indexCache.set(key, await this.repository.loadIndex(workspaceRoot, outputDirectory));
    }

    return this.indexCache.get(key) ?? null;
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
    const prefix = `${getWorkspaceCacheKey(workspaceRoot, outputDirectory)}::`;

    this.indexCache.delete(getWorkspaceCacheKey(workspaceRoot, outputDirectory));

    for (const key of this.sourceFileCache.keys()) {
      if (key.startsWith(prefix)) {
        this.sourceFileCache.delete(key);
      }
    }
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
  async getSourceFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
  ): Promise<StoredSourceFile | undefined> {
    const key = getSourceFileCacheKey(workspaceRoot, outputDirectory, relativeFilePath);

    if (!this.sourceFileCache.has(key)) {
      this.sourceFileCache.set(
        key,
        await this.repository.getSourceFile(workspaceRoot, outputDirectory, relativeFilePath),
      );
    }

    return this.sourceFileCache.get(key);
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
  async saveSourceFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceFile: StoredSourceFile,
    now: string,
  ): Promise<void> {
    await this.repository.saveSourceFile(workspaceRoot, outputDirectory, relativeFilePath, sourceFile, now);
    this.sourceFileCache.set(
      getSourceFileCacheKey(workspaceRoot, outputDirectory, relativeFilePath),
      sourceFile,
    );
    this.indexCache.set(
      getWorkspaceCacheKey(workspaceRoot, outputDirectory),
      await this.repository.loadIndex(workspaceRoot, outputDirectory),
    );
  }

  /**
   * Renames or moves one source-file note index entry.
   *
   * The physical per-file note JSON path is preserved. Only the source file key
   * in the workspace note index changes.
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
  async renameSourceFileEntry(
    workspaceRoot: string,
    outputDirectory: string,
    oldRelativePath: string,
    newRelativePath: string,
    now: string,
  ): Promise<WorkspaceNoteIndexV1> {
    const index = await this.getRequiredIndex(workspaceRoot, outputDirectory);
    const next = renameSourceFileEntry(index, oldRelativePath, newRelativePath, now);
    const workspaceKey = getWorkspaceCacheKey(workspaceRoot, outputDirectory);
    const oldSourceFileKey = getSourceFileCacheKey(workspaceRoot, outputDirectory, oldRelativePath);
    const newSourceFileKey = getSourceFileCacheKey(workspaceRoot, outputDirectory, newRelativePath);
    const cachedSourceFile = this.sourceFileCache.get(oldSourceFileKey);

    await this.repository.saveIndex(workspaceRoot, outputDirectory, next);

    this.indexCache.set(workspaceKey, next);
    this.sourceFileCache.delete(oldSourceFileKey);

    if (cachedSourceFile) {
      this.sourceFileCache.set(newSourceFileKey, cachedSourceFile);
    } else {
      this.sourceFileCache.delete(newSourceFileKey);
    }

    return next;
  }

  /**
   * Removes one source-file note index entry.
   *
   * The per-file note JSON is left on disk. This is useful when the UI wants to
   * detach a source path without destroying recoverable notes.
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
  async deleteSourceFileEntry(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    now: string,
  ): Promise<WorkspaceNoteIndexV1> {
    const index = await this.getRequiredIndex(workspaceRoot, outputDirectory);
    const next = deleteSourceFileEntry(index, relativeFilePath, now);

    if (next !== index) {
      await this.repository.saveIndex(workspaceRoot, outputDirectory, next);
    }

    this.indexCache.set(getWorkspaceCacheKey(workspaceRoot, outputDirectory), next);
    this.sourceFileCache.delete(getSourceFileCacheKey(workspaceRoot, outputDirectory, relativeFilePath));

    return next;
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
  async updateSourceHash(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceHash: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateStoredSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      now,
      (sourceFile) => updateSourceHash(sourceFile, sourceHash),
    );
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
  async updateProgrammingLanguage(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    programmingLanguage: ProgrammingLanguage | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateStoredSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      now,
      (sourceFile) => updateProgrammingLanguage(sourceFile, programmingLanguage),
    );
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
  async updateFileNoteStatus(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    status: NoteStatus,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateStoredSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      now,
      (sourceFile) => updateFileNoteStatus(sourceFile, status, now),
    );
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
  async updateSectionNoteStatus(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    status: NoteStatus,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateStoredSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      now,
      (sourceFile) => updateSectionNoteStatus(sourceFile, sectionId, status, now),
    );
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
  async updateLineNoteStatus(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    status: NoteStatus,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateStoredSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      now,
      (sourceFile) => updateLineNoteStatus(sourceFile, lineId, status, now),
    );
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
  async markSourceFileNotesStale(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateStoredSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      now,
      (sourceFile) => markSourceFileNotesStale(sourceFile, now),
    );
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
  async markSourceFileNotesCurrentConfirmed(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateStoredSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      now,
      (sourceFile) => markSourceFileNotesCurrentConfirmed(sourceFile, now),
    );
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
  async updateSectionRange(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    range: LineRange,
    lineCount: number,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateStoredSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      now,
      (sourceFile) => updateSectionRange(sourceFile, sectionId, range, lineCount, now),
    );
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
  async updateSectionAnchorHash(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    anchorHash: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateStoredSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      now,
      (sourceFile) => updateSectionAnchorHash(sourceFile, sectionId, anchorHash, now),
    );
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
  async updateLineNumber(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    line: number,
    lineCount: number,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateStoredSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      now,
      (sourceFile) => updateLineNumber(sourceFile, lineId, line, lineCount, now),
    );
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
  async updateLineAnchorText(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    anchorText: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateStoredSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      now,
      (sourceFile) => updateLineAnchorText(sourceFile, lineId, anchorText, now),
    );
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
  async updateFileUserNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    userNote: string | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateStoredSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      now,
      (sourceFile) => updateFileUserNote(sourceFile, userNote, now),
    );
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
  async updateSectionUserNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    userNote: string | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateStoredSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      now,
      (sourceFile) => updateSectionUserNote(sourceFile, sectionId, userNote, now),
    );
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
  async updateLineUserNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    userNote: string | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateStoredSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      now,
      (sourceFile) => updateLineUserNote(sourceFile, lineId, userNote, now),
    );
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
  async updateFileAiExplanation(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    aiExplanation: AIExplanation | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateStoredSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      now,
      (sourceFile) => updateFileAiExplanation(sourceFile, aiExplanation, now),
    );
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
  async updateSectionAiExplanation(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    aiExplanation: AIExplanation | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateStoredSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      now,
      (sourceFile) => updateSectionAiExplanation(sourceFile, sectionId, aiExplanation, now),
    );
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
  async updateLineAiExplanation(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    aiExplanation: AIExplanation | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateStoredSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      now,
      (sourceFile) => updateLineAiExplanation(sourceFile, lineId, aiExplanation, now),
    );
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
  async updateSectionTitle(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    title: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateStoredSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      now,
      (sourceFile) => updateSectionTitle(sourceFile, sectionId, title, now),
    );
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
  async updateSectionKind(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    kind: string | undefined,
    now: string,
  ): Promise<StoredSourceFile> {
    return this.updateStoredSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      now,
      (sourceFile) => updateSectionKind(sourceFile, sectionId, kind, now),
    );
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
  async getFileNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
  ): Promise<StoredFileNote | undefined> {
    const sourceFile = await this.getSourceFile(workspaceRoot, outputDirectory, relativeFilePath);

    return sourceFile ? getFileNote(sourceFile) : undefined;
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
  async upsertFileNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    fileNote: FileNoteUpsertInput,
    now: string,
  ): Promise<StoredSourceFile> {
    const sourceFile = await this.getRequiredSourceFile(workspaceRoot, outputDirectory, relativeFilePath);
    const next = upsertFileNote(sourceFile, fileNote, now);

    await this.saveSourceFile(workspaceRoot, outputDirectory, relativeFilePath, next, now);

    return next;
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
  async deleteFileNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    now: string,
  ): Promise<StoredSourceFile> {
    const sourceFile = await this.getRequiredSourceFile(workspaceRoot, outputDirectory, relativeFilePath);
    const next = deleteFileNote(sourceFile);

    await this.saveSourceFile(workspaceRoot, outputDirectory, relativeFilePath, next, now);

    return next;
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
   * const note = await manager.getSectionNote("/workspace/project", ".czaza", "src/index.ts", "section:1:intro:1-3");
   */
  async getSectionNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
  ): Promise<StoredSectionNote | undefined> {
    const sourceFile = await this.getSourceFile(workspaceRoot, outputDirectory, relativeFilePath);

    return sourceFile ? getSectionNote(sourceFile, sectionId) : undefined;
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
  async upsertSectionNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionNote: SectionNoteUpsertInput,
    now: string,
  ): Promise<StoredSourceFile> {
    const sourceFile = await this.getRequiredSourceFile(workspaceRoot, outputDirectory, relativeFilePath);
    const next = upsertSectionNote(sourceFile, sectionNote, now);

    await this.saveSourceFile(workspaceRoot, outputDirectory, relativeFilePath, next, now);

    return next;
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
   * const next = await manager.deleteSectionNote("/workspace/project", ".czaza", "src/index.ts", "section:1:intro:1-3", now);
   */
  async deleteSectionNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    now: string,
  ): Promise<StoredSourceFile> {
    const sourceFile = await this.getRequiredSourceFile(workspaceRoot, outputDirectory, relativeFilePath);
    const next = deleteSectionNote(sourceFile, sectionId);

    await this.saveSourceFile(workspaceRoot, outputDirectory, relativeFilePath, next, now);

    return next;
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
  async getLineNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
  ): Promise<StoredLineNote | undefined> {
    const sourceFile = await this.getSourceFile(workspaceRoot, outputDirectory, relativeFilePath);

    return sourceFile ? getLineNote(sourceFile, lineId) : undefined;
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
  async upsertLineNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineNote: LineNoteUpsertInput,
    now: string,
  ): Promise<StoredSourceFile> {
    const sourceFile = await this.getRequiredSourceFile(workspaceRoot, outputDirectory, relativeFilePath);
    const next = upsertLineNote(sourceFile, lineNote, now);

    await this.saveSourceFile(workspaceRoot, outputDirectory, relativeFilePath, next, now);

    return next;
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
  async deleteLineNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    now: string,
  ): Promise<StoredSourceFile> {
    const sourceFile = await this.getRequiredSourceFile(workspaceRoot, outputDirectory, relativeFilePath);
    const next = deleteLineNote(sourceFile, lineId);

    await this.saveSourceFile(workspaceRoot, outputDirectory, relativeFilePath, next, now);

    return next;
  }

  /**
   * Reads one source file and throws when it has not been initialized.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @returns Stored source file.
   *
   * @example
   * const sourceFile = await manager.getRequiredSourceFile("/workspace/project", ".czaza", "src/index.ts");
   */
  private async getRequiredSourceFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
  ): Promise<StoredSourceFile> {
    const sourceFile = await this.getSourceFile(workspaceRoot, outputDirectory, relativeFilePath);

    if (!sourceFile) {
      throw new Error(`Source file notes are not initialized: ${relativeFilePath}`);
    }

    return sourceFile;
  }

  /**
   * Applies one stored source file update and persists the result.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param now - ISO 8601 timestamp used for index updatedAt.
   * @param update - Pure source file update function.
   * @returns Updated stored source file.
   *
   * @example
   * const next = await this.updateStoredSourceFile(root, ".czaza", "src/index.ts", now, (sourceFile) => sourceFile);
   */
  private async updateStoredSourceFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    now: string,
    update: (sourceFile: StoredSourceFile) => StoredSourceFile,
  ): Promise<StoredSourceFile> {
    const sourceFile = await this.getRequiredSourceFile(workspaceRoot, outputDirectory, relativeFilePath);
    const next = update(sourceFile);

    await this.saveSourceFile(workspaceRoot, outputDirectory, relativeFilePath, next, now);

    return next;
  }

  /**
   * Reads the workspace note index and throws when it has not been initialized.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @returns Workspace note index.
   *
   * @example
   * const index = await manager.getRequiredIndex("/workspace/project", ".czaza");
   */
  private async getRequiredIndex(
    workspaceRoot: string,
    outputDirectory: string,
  ): Promise<WorkspaceNoteIndexV1> {
    const index = await this.loadIndex(workspaceRoot, outputDirectory);

    if (!index) {
      throw new Error(`Workspace note index is not initialized: ${outputDirectory}`);
    }

    return index;
  }
}

/**
 * Creates a cache key for one workspace/output directory pair.
 *
 * @param workspaceRoot - Absolute workspace root path.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @returns Cache key.
 *
 * @example
 * const key = getWorkspaceCacheKey("/workspace/project", ".czaza");
 */
function getWorkspaceCacheKey(workspaceRoot: string, outputDirectory: string): string {
  return `${workspaceRoot}::${outputDirectory}`;
}

/**
 * Creates a cache key for one stored source file.
 *
 * @param workspaceRoot - Absolute workspace root path.
 * @param outputDirectory - Workspace-relative CZaza output directory.
 * @param relativeFilePath - Normalized workspace-relative source file path.
 * @returns Cache key.
 *
 * @example
 * const key = getSourceFileCacheKey("/workspace/project", ".czaza", "src/index.ts");
 */
function getSourceFileCacheKey(
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
): string {
  return `${getWorkspaceCacheKey(workspaceRoot, outputDirectory)}::${relativeFilePath}`;
}
