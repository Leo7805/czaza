/**
 * Provides manager-bound source-file index update helpers.
 */

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import type { WorkspaceNoteIndexV1 } from "@shared/models/store/workspace";
import {
  deleteSourceFileEntry as deleteSourceFileEntryPure,
  renameSourceFileEntry as renameSourceFileEntryPure,
} from "@shared/services/notes/noteIndexService";
import type { WorkspaceNoteStoreRepository } from "./WorkspaceNoteStoreRepository";

/**
 * Dependencies required by source-file index helpers.
 *
 * @example
 * const deps: WorkspaceNoteSourceIndexDependencies = managerDeps;
 */
export type WorkspaceNoteSourceIndexDependencies = {
  /** Repository used to persist index updates. */
  repository: WorkspaceNoteStoreRepository;

  /** Cached workspace indexes keyed by workspace/output directory. */
  indexCache: Map<string, WorkspaceNoteIndexV1 | null>;

  /** Cached per-file notes keyed by workspace/output/source path. */
  sourceFileCache: Map<string, StoredSourceFile | undefined>;

  /** Reads the workspace note index and throws when it is missing. */
  getRequiredIndex(workspaceRoot: string, outputDirectory: string): Promise<WorkspaceNoteIndexV1>;
};

/**
 * Renames or moves one source-file note index entry.
 *
 * @example
 * const index = await renameSourceFileEntry(deps, root, ".czaza", "src/old.ts", "src/new.ts", now);
 */
export async function renameSourceFileEntry(
  deps: WorkspaceNoteSourceIndexDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  oldRelativePath: string,
  newRelativePath: string,
  now: string,
): Promise<WorkspaceNoteIndexV1> {
  const index = await deps.getRequiredIndex(workspaceRoot, outputDirectory);
  const next = renameSourceFileEntryPure(index, oldRelativePath, newRelativePath, now);
  const workspaceKey = getWorkspaceCacheKey(workspaceRoot, outputDirectory);
  const oldSourceFileKey = getSourceFileCacheKey(workspaceRoot, outputDirectory, oldRelativePath);
  const newSourceFileKey = getSourceFileCacheKey(workspaceRoot, outputDirectory, newRelativePath);
  const cachedSourceFile = deps.sourceFileCache.get(oldSourceFileKey);

  await deps.repository.saveIndex(workspaceRoot, outputDirectory, next);

  deps.indexCache.set(workspaceKey, next);
  deps.sourceFileCache.delete(oldSourceFileKey);

  if (cachedSourceFile) {
    deps.sourceFileCache.set(newSourceFileKey, cachedSourceFile);
  } else {
    deps.sourceFileCache.delete(newSourceFileKey);
  }

  return next;
}

/**
 * Removes one source-file note index entry without deleting the note JSON.
 *
 * @example
 * const index = await deleteSourceFileEntry(deps, root, ".czaza", "src/old.ts", now);
 */
export async function deleteSourceFileEntry(
  deps: WorkspaceNoteSourceIndexDependencies,
  workspaceRoot: string,
  outputDirectory: string,
  relativeFilePath: string,
  now: string,
): Promise<WorkspaceNoteIndexV1> {
  const index = await deps.getRequiredIndex(workspaceRoot, outputDirectory);
  const next = deleteSourceFileEntryPure(index, relativeFilePath, now);

  if (next !== index) {
    await deps.repository.saveIndex(workspaceRoot, outputDirectory, next);
  }

  deps.indexCache.set(getWorkspaceCacheKey(workspaceRoot, outputDirectory), next);
  deps.sourceFileCache.delete(getSourceFileCacheKey(workspaceRoot, outputDirectory, relativeFilePath));

  return next;
}

/**
 * Creates a cache key for one workspace/output directory pair.
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
