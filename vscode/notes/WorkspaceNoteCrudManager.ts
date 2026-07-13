/**
 * Provides workspace file, section, and line note CRUD operations.
 */

import type { StoredFileNote } from "@shared/models/store/file";
import type { StoredLineNote } from "@shared/models/store/line";
import type { StoredSectionNote } from "@shared/models/store/section";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import type {
  FileNoteUpsertInput,
  LineNoteUpsertInput,
  SectionNoteUpsertInput,
} from "@shared/services/notes/sourceFileNoteCrudService";
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
} from "./workspaceNoteStoreCrud";
import { WorkspaceNoteStoreCache } from "./WorkspaceNoteStoreCache";

/**
 * Coordinates note CRUD operations using the shared note store cache.
 *
 * @example
 * const manager = new WorkspaceNoteCrudManager(cache);
 * const note = await manager.getFileNote(root, ".czaza", "src/index.ts");
 */
export class WorkspaceNoteCrudManager {
  private readonly cache: WorkspaceNoteStoreCache;

  /**
   * Creates a workspace note CRUD manager.
   *
   * @param cache - Shared note store cache.
   *
   * @example
   * const manager = new WorkspaceNoteCrudManager(cache);
   */
  constructor(cache: WorkspaceNoteStoreCache) {
    this.cache = cache;
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
   * const note = await manager.getFileNote(root, ".czaza", "src/index.ts");
   */
  getFileNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
  ): Promise<StoredFileNote | undefined> {
    return getFileNote(this.cache, workspaceRoot, outputDirectory, relativeFilePath);
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
   * const next = await manager.upsertFileNote(root, ".czaza", "src/index.ts", note, now);
   */
  upsertFileNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    fileNote: FileNoteUpsertInput,
    now: string,
  ): Promise<StoredSourceFile> {
    return upsertFileNote(this.cache, workspaceRoot, outputDirectory, relativeFilePath, fileNote, now);
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
   * const next = await manager.deleteFileNote(root, ".czaza", "src/index.ts", now);
   */
  deleteFileNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return deleteFileNote(this.cache, workspaceRoot, outputDirectory, relativeFilePath, now);
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
   * const note = await manager.getSectionNote(root, ".czaza", "src/index.ts", "section:1");
   */
  getSectionNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
  ): Promise<StoredSectionNote | undefined> {
    return getSectionNote(this.cache, workspaceRoot, outputDirectory, relativeFilePath, sectionId);
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
   * const next = await manager.upsertSectionNote(root, ".czaza", "src/index.ts", note, now);
   */
  upsertSectionNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionNote: SectionNoteUpsertInput,
    now: string,
  ): Promise<StoredSourceFile> {
    return upsertSectionNote(this.cache, workspaceRoot, outputDirectory, relativeFilePath, sectionNote, now);
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
   * const next = await manager.deleteSectionNote(root, ".czaza", "src/index.ts", "section:1", now);
   */
  deleteSectionNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sectionId: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return deleteSectionNote(this.cache, workspaceRoot, outputDirectory, relativeFilePath, sectionId, now);
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
   * const note = await manager.getLineNote(root, ".czaza", "src/index.ts", "line:1");
   */
  getLineNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
  ): Promise<StoredLineNote | undefined> {
    return getLineNote(this.cache, workspaceRoot, outputDirectory, relativeFilePath, lineId);
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
   * const next = await manager.upsertLineNote(root, ".czaza", "src/index.ts", note, now);
   */
  upsertLineNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineNote: LineNoteUpsertInput,
    now: string,
  ): Promise<StoredSourceFile> {
    return upsertLineNote(this.cache, workspaceRoot, outputDirectory, relativeFilePath, lineNote, now);
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
   * const next = await manager.deleteLineNote(root, ".czaza", "src/index.ts", "line:1", now);
   */
  deleteLineNote(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    lineId: string,
    now: string,
  ): Promise<StoredSourceFile> {
    return deleteLineNote(this.cache, workspaceRoot, outputDirectory, relativeFilePath, lineId, now);
  }
}
