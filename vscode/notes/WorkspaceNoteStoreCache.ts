/**
 * Manages cached workspace note index and per-file note reads/writes.
 */

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import type { WorkspaceNoteIndexV2 } from "@shared/models/store/workspace";
import {
  type NoteStorePersistenceOptions,
  WorkspaceNoteStoreRepository,
} from "./WorkspaceNoteStoreRepository";
import {
  getNoteStoreLocationKey,
  type NoteStoreLocation,
  TEAM_NOTE_STORE,
} from "./NoteStoreLocation";

/**
 * Coordinates repository IO with in-memory workspace note caches.
 *
 * @example
 * const cache = new WorkspaceNoteStoreCache(new WorkspaceNoteStoreRepository());
 * const index = await cache.loadIndex("/workspace/project", ".czaza");
 */
export class WorkspaceNoteStoreCache {
  readonly repository: WorkspaceNoteStoreRepository;
  readonly indexCache = new Map<string, WorkspaceNoteIndexV2 | null>();
  readonly sourceFileCache = new Map<string, StoredSourceFile | undefined>();

  /**
   * Creates a workspace note store cache.
   *
   * @param repository - Repository used for filesystem reads and writes.
   *
   * @example
   * const cache = new WorkspaceNoteStoreCache(new WorkspaceNoteStoreRepository());
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
   * const index = await cache.loadIndex("/workspace/project", ".czaza");
   */
  async loadIndex(workspaceRoot: string, outputDirectory: string, location: NoteStoreLocation = TEAM_NOTE_STORE): Promise<WorkspaceNoteIndexV2 | null> {
    const key = getWorkspaceCacheKey(workspaceRoot, outputDirectory, location);

    if (!this.indexCache.has(key)) {
      this.indexCache.set(key, await this.repository.loadIndex(workspaceRoot, outputDirectory, location));
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
   * cache.clearCache("/workspace/project", ".czaza");
   */
  clearCache(workspaceRoot: string, outputDirectory: string, location: NoteStoreLocation = TEAM_NOTE_STORE): void {
    const prefix = `${getWorkspaceCacheKey(workspaceRoot, outputDirectory, location)}::`;

    this.indexCache.delete(getWorkspaceCacheKey(workspaceRoot, outputDirectory, location));

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
   * const sourceFile = await cache.getSourceFile("/workspace/project", ".czaza", "src/index.ts");
   */
  async getSourceFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    location: NoteStoreLocation = TEAM_NOTE_STORE,
  ): Promise<StoredSourceFile | undefined> {
    const key = getSourceFileCacheKey(workspaceRoot, outputDirectory, relativeFilePath, location);

    if (!this.sourceFileCache.has(key)) {
      this.sourceFileCache.set(
        key,
        await this.repository.getSourceFile(workspaceRoot, outputDirectory, relativeFilePath, location),
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
   * @param options - Optional automatic persistence safety checks.
   * @returns Promise that resolves after saving.
   *
   * @example
   * await cache.saveSourceFile("/workspace/project", ".czaza", "src/index.ts", sourceFile, now);
   */
  async saveSourceFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    sourceFile: StoredSourceFile,
    now: string,
    options: NoteStorePersistenceOptions = {},
    location: NoteStoreLocation = TEAM_NOTE_STORE,
  ): Promise<void> {
    const result = await this.repository.saveSourceFile(
      workspaceRoot,
      outputDirectory,
      relativeFilePath,
      sourceFile,
      now,
      options,
      location,
    );

    if (result === "cancelled") {
      this.clearCache(workspaceRoot, outputDirectory, location);
      return;
    }

    this.sourceFileCache.set(
      getSourceFileCacheKey(workspaceRoot, outputDirectory, relativeFilePath, location),
      sourceFile,
    );
    this.indexCache.set(
      getWorkspaceCacheKey(workspaceRoot, outputDirectory, location),
      await this.repository.loadIndex(workspaceRoot, outputDirectory, location),
    );
  }

  /**
   * Deletes one cached stored source-file note JSON.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Normalized workspace-relative source file path.
   * @param noteFile - Note file path relative to the notes directory.
   * @returns Promise that resolves after the note file is removed.
   */
  async deleteSourceFileNoteFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    noteFile: string,
    location: NoteStoreLocation = TEAM_NOTE_STORE,
  ): Promise<void> {
    await this.repository.deleteSourceFileNoteFile(workspaceRoot, outputDirectory, noteFile, location);
    this.sourceFileCache.set(
      getSourceFileCacheKey(workspaceRoot, outputDirectory, relativeFilePath, location),
      undefined,
    );
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
   * const sourceFile = await cache.getRequiredSourceFile("/workspace/project", ".czaza", "src/index.ts");
   */
  async getRequiredSourceFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    location: NoteStoreLocation = TEAM_NOTE_STORE,
  ): Promise<StoredSourceFile> {
    const sourceFile = await this.getSourceFile(workspaceRoot, outputDirectory, relativeFilePath, location);

    if (!sourceFile) {
      throw new Error(`Source file notes are not initialized: ${relativeFilePath}`);
    }

    return sourceFile;
  }

  /**
   * Reads a source-file note using a case-insensitive workspace-relative path match.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativeFilePath - Current workspace-relative resource path.
   * @returns The matching stored source file, or undefined when no entry matches.
   */
  async getSourceFileCaseInsensitive(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    location: NoteStoreLocation = TEAM_NOTE_STORE,
  ): Promise<StoredSourceFile | undefined> {
    const index = await this.loadIndex(workspaceRoot, outputDirectory, location);
    if (!index) {
      return undefined;
    }

    const normalizedPath = relativeFilePath.toLowerCase();
    const matchedPath = Object.keys(index.files).find(
      (candidate) => candidate.toLowerCase() === normalizedPath,
    );

    return matchedPath !== undefined
      ? this.getSourceFile(workspaceRoot, outputDirectory, matchedPath, location)
      : undefined;
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
   * const next = await cache.updateStoredSourceFile(root, ".czaza", "src/index.ts", now, (sourceFile) => sourceFile);
   */
  async updateStoredSourceFile(
    workspaceRoot: string,
    outputDirectory: string,
    relativeFilePath: string,
    now: string,
    update: (sourceFile: StoredSourceFile) => StoredSourceFile,
    location: NoteStoreLocation = TEAM_NOTE_STORE,
  ): Promise<StoredSourceFile> {
    const sourceFile = await this.getRequiredSourceFile(workspaceRoot, outputDirectory, relativeFilePath, location);
    const next = update(sourceFile);

    await this.saveSourceFile(workspaceRoot, outputDirectory, relativeFilePath, next, now, {}, location);

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
   * const index = await cache.getRequiredIndex("/workspace/project", ".czaza");
   */
  async getRequiredIndex(
    workspaceRoot: string,
    outputDirectory: string,
    location: NoteStoreLocation = TEAM_NOTE_STORE,
  ): Promise<WorkspaceNoteIndexV2> {
    const index = await this.loadIndex(workspaceRoot, outputDirectory, location);

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
function getWorkspaceCacheKey(workspaceRoot: string, outputDirectory: string, location: NoteStoreLocation = TEAM_NOTE_STORE): string {
  const baseKey = `${workspaceRoot}::${outputDirectory}`;
  return location.kind === "team" ? baseKey : `${baseKey}::${getNoteStoreLocationKey(location)}`;
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
  location: NoteStoreLocation = TEAM_NOTE_STORE,
): string {
  return `${getWorkspaceCacheKey(workspaceRoot, outputDirectory, location)}::${relativeFilePath}`;
}
