/**
 * Provides source-file index update operations for workspace notes.
 */

import type { WorkspaceNoteIndexV1 } from "@shared/models/store/workspace";
import {
  deleteSourceFileEntry,
  renameSourceFileEntry,
  type WorkspaceNoteSourceIndexDependencies,
} from "./workspaceNoteStoreSourceIndex";
import { WorkspaceNoteStoreCache } from "./WorkspaceNoteStoreCache";

/**
 * Coordinates source-file index updates using the shared note store cache.
 *
 * @example
 * const manager = new WorkspaceNoteSourceIndexManager(cache);
 * const index = await manager.renameSourceFileEntry(root, ".czaza", "src/old.ts", "src/new.ts", now);
 */
export class WorkspaceNoteSourceIndexManager {
  private readonly cache: WorkspaceNoteStoreCache;

  /**
   * Creates a workspace note source index manager.
   *
   * @param cache - Shared note store cache.
   *
   * @example
   * const manager = new WorkspaceNoteSourceIndexManager(cache);
   */
  constructor(cache: WorkspaceNoteStoreCache) {
    this.cache = cache;
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
   * const index = await manager.renameSourceFileEntry(root, ".czaza", "src/old.ts", "src/new.ts", now);
   */
  renameSourceFileEntry(
    workspaceRoot: string,
    outputDirectory: string,
    oldRelativePath: string,
    newRelativePath: string,
    now: string,
  ): Promise<WorkspaceNoteIndexV1> {
    return renameSourceFileEntry(this.getDependencies(), workspaceRoot, outputDirectory, oldRelativePath, newRelativePath, now);
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
   * const index = await manager.deleteSourceFileEntry(root, ".czaza", "src/old.ts", now);
   */
  deleteSourceFileEntry(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    now: string,
  ): Promise<WorkspaceNoteIndexV1> {
    return deleteSourceFileEntry(this.getDependencies(), workspaceRoot, outputDirectory, relativeFilePath, now);
  }

  private getDependencies(): WorkspaceNoteSourceIndexDependencies {
    return {
      repository: this.cache.repository,
      indexCache: this.cache.indexCache,
      sourceFileCache: this.cache.sourceFileCache,
      getRequiredIndex: this.cache.getRequiredIndex.bind(this.cache),
    };
  }
}
