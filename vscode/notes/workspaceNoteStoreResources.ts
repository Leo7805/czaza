/**
 * Resource-level workspace note store operations.
 */

import type { WorkspaceNoteFileIndexEntry, WorkspaceNoteIndexV1 } from "@shared/models/store/workspace";
import {
  applyFileNoteResourceDeleted,
  applyFileNoteResourceMoved,
  type FileNoteChangeEvent,
} from "@shared/services/notes/fileNoteChangeService";
import type { WorkspaceNoteStoreCache } from "./WorkspaceNoteStoreCache";

/** Result of moving a source-file note index entry. */
export type MoveSourceFileEntryResult =
  | {
      kind: "moved";
      previousRelativePath: string;
      nextRelativePath: string;
      noteFile: string;
      events: FileNoteChangeEvent[];
    }
  | {
      kind: "notFound";
      previousRelativePath: string;
    }
  | {
      kind: "conflict";
      nextRelativePath: string;
    };

/** Result of marking a source-file note entry as deleted. */
export type MarkSourceFileEntryDeletedResult =
  | {
      kind: "markedDeleted";
      relativePath: string;
      events: FileNoteChangeEvent[];
    }
  | {
      kind: "notFound";
      relativePath: string;
    };

/** Result of permanently deleting a source-file note entry. */
export type DeleteSourceFileEntryResult =
  | {
      kind: "deleted";
      relativePath: string;
      noteFile: string;
    }
  | {
      kind: "notFound";
      relativePath: string;
    };

/** Resource-level operations for source-file note entries. */
export class WorkspaceNoteResourceManager {
  private readonly cache: WorkspaceNoteStoreCache;

  /**
   * Creates a resource manager backed by the shared note store cache.
   *
   * @param cache - Shared workspace note cache.
   */
  constructor(cache: WorkspaceNoteStoreCache) {
    this.cache = cache;
  }

  /**
   * Moves one source-file note entry from an old relative path to a new relative path.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param previousRelativePath - Existing CZaza-root-relative source path.
   * @param nextRelativePath - Next CZaza-root-relative source path.
   * @param now - ISO 8601 timestamp used for index and note metadata.
   * @returns Move result.
   */
  moveSourceFileEntry(
    workspaceRoot: string,
    outputDirectory: string,
    previousRelativePath: string,
    nextRelativePath: string,
    now: string,
  ): Promise<MoveSourceFileEntryResult> {
    return moveSourceFileEntry({
      cache: this.cache,
      workspaceRoot,
      outputDirectory,
      previousRelativePath,
      nextRelativePath,
      now,
    });
  }

  /**
   * Marks one source-file note entry as explicitly deleted.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativePath - Deleted CZaza-root-relative source path.
   * @param now - ISO 8601 timestamp used for note metadata.
   * @returns Delete marking result.
   */
  markSourceFileEntryDeleted(
    workspaceRoot: string,
    outputDirectory: string,
    relativePath: string,
    now: string,
  ): Promise<MarkSourceFileEntryDeletedResult> {
    return markSourceFileEntryDeleted({
      cache: this.cache,
      workspaceRoot,
      outputDirectory,
      relativePath,
      now,
    });
  }

  /**
   * Permanently deletes one source-file note entry and its note JSON.
   *
   * @param workspaceRoot - Absolute workspace root path.
   * @param outputDirectory - Workspace-relative CZaza output directory.
   * @param relativePath - CZaza-root-relative source path.
   * @param now - ISO 8601 timestamp used for index metadata.
   * @returns Delete result.
   */
  deleteSourceFileEntry(
    workspaceRoot: string,
    outputDirectory: string,
    relativePath: string,
    now: string,
  ): Promise<DeleteSourceFileEntryResult> {
    return deleteSourceFileEntry({
      cache: this.cache,
      workspaceRoot,
      outputDirectory,
      relativePath,
      now,
    });
  }
}

/**
 * Moves one source-file note index entry from an old relative path to a new relative path.
 *
 * The per-file note JSON is not renamed. The caller owns converting editor or
 * filesystem events into normalized CZaza-relative paths.
 *
 * @param input - Cache, workspace paths, old/new relative paths, and timestamp.
 * @returns Move result.
 *
 * @example
 * await moveSourceFileEntry({ cache, workspaceRoot, outputDirectory, previousRelativePath: "a.ts", nextRelativePath: "b.ts", now });
 */
export async function moveSourceFileEntry(input: {
  cache: WorkspaceNoteStoreCache;
  workspaceRoot: string;
  outputDirectory: string;
  previousRelativePath: string;
  nextRelativePath: string;
  now: string;
}): Promise<MoveSourceFileEntryResult> {
  const index = await input.cache.loadIndex(input.workspaceRoot, input.outputDirectory);
  const previousEntry = index?.files[input.previousRelativePath];

  if (!index || !previousEntry) {
    return {
      kind: "notFound",
      previousRelativePath: input.previousRelativePath,
    };
  }

  if (index.files[input.nextRelativePath]) {
    return {
      kind: "conflict",
      nextRelativePath: input.nextRelativePath,
    };
  }

  const sourceFile = await input.cache.getSourceFile(
    input.workspaceRoot,
    input.outputDirectory,
    input.previousRelativePath,
  );
  const nextIndex = moveIndexEntry({
    index,
    previousRelativePath: input.previousRelativePath,
    nextRelativePath: input.nextRelativePath,
    previousEntry,
    now: input.now,
  });

  await input.cache.repository.saveIndex(input.workspaceRoot, input.outputDirectory, nextIndex);
  input.cache.clearCache(input.workspaceRoot, input.outputDirectory);

  if (!sourceFile) {
    return {
      kind: "moved",
      previousRelativePath: input.previousRelativePath,
      nextRelativePath: input.nextRelativePath,
      noteFile: previousEntry.noteFile,
      events: [
        {
          type: "fileNoteResourceMoved",
          previousRelativePath: input.previousRelativePath,
          nextRelativePath: input.nextRelativePath,
        },
      ],
    };
  }

  const applied = applyFileNoteResourceMoved({
    sourceFile,
    previousRelativePath: input.previousRelativePath,
    nextRelativePath: input.nextRelativePath,
    now: input.now,
  });

  if (applied.changed) {
    await input.cache.saveSourceFile(
      input.workspaceRoot,
      input.outputDirectory,
      input.nextRelativePath,
      applied.sourceFile,
      input.now,
    );
  }

  return {
    kind: "moved",
    previousRelativePath: input.previousRelativePath,
    nextRelativePath: input.nextRelativePath,
    noteFile: previousEntry.noteFile,
    events: applied.events,
  };
}

/**
 * Marks one source-file note entry as explicitly deleted.
 *
 * The index entry is intentionally retained so the note can remain visible as
 * orphaned until a later cleanup or restore flow removes it.
 *
 * @param input - Cache, workspace paths, deleted relative path, and timestamp.
 * @returns Delete marking result.
 *
 * @example
 * await markSourceFileEntryDeleted({ cache, workspaceRoot, outputDirectory, relativePath: "src/a.ts", now });
 */
export async function markSourceFileEntryDeleted(input: {
  cache: WorkspaceNoteStoreCache;
  workspaceRoot: string;
  outputDirectory: string;
  relativePath: string;
  now: string;
}): Promise<MarkSourceFileEntryDeletedResult> {
  const sourceFile = await input.cache.getSourceFile(
    input.workspaceRoot,
    input.outputDirectory,
    input.relativePath,
  );

  if (!sourceFile) {
    return {
      kind: "notFound",
      relativePath: input.relativePath,
    };
  }

  const applied = applyFileNoteResourceDeleted({
    sourceFile,
    relativePath: input.relativePath,
    now: input.now,
  });

  if (applied.changed) {
    await input.cache.saveSourceFile(
      input.workspaceRoot,
      input.outputDirectory,
      input.relativePath,
      applied.sourceFile,
      input.now,
    );
  }

  return {
    kind: "markedDeleted",
    relativePath: input.relativePath,
    events: applied.events,
  };
}

/**
 * Permanently deletes one source-file note index entry and note JSON.
 *
 * @param input - Cache, workspace paths, source path, and timestamp.
 * @returns Delete result.
 */
export async function deleteSourceFileEntry(input: {
  cache: WorkspaceNoteStoreCache;
  workspaceRoot: string;
  outputDirectory: string;
  relativePath: string;
  now: string;
}): Promise<DeleteSourceFileEntryResult> {
  const index = await input.cache.loadIndex(input.workspaceRoot, input.outputDirectory);
  const entry = index?.files[input.relativePath];

  if (!index || !entry) {
    return {
      kind: "notFound",
      relativePath: input.relativePath,
    };
  }

  const nextIndex = deleteIndexEntry({
    index,
    relativePath: input.relativePath,
    now: input.now,
  });

  await input.cache.deleteSourceFileNoteFile(
    input.workspaceRoot,
    input.outputDirectory,
    input.relativePath,
    entry.noteFile,
  );
  await input.cache.repository.saveIndex(input.workspaceRoot, input.outputDirectory, nextIndex);
  input.cache.clearCache(input.workspaceRoot, input.outputDirectory);

  return {
    kind: "deleted",
    relativePath: input.relativePath,
    noteFile: entry.noteFile,
  };
}

function moveIndexEntry(input: {
  index: WorkspaceNoteIndexV1;
  previousRelativePath: string;
  nextRelativePath: string;
  previousEntry: WorkspaceNoteFileIndexEntry;
  now: string;
}): WorkspaceNoteIndexV1 {
  const { [input.previousRelativePath]: _removed, ...remainingFiles } = input.index.files;

  return {
    ...input.index,
    updatedAt: input.now,
    files: {
      ...remainingFiles,
      [input.nextRelativePath]: {
        ...input.previousEntry,
        updatedAt: input.now,
      },
    },
  };
}

function deleteIndexEntry(input: {
  index: WorkspaceNoteIndexV1;
  relativePath: string;
  now: string;
}): WorkspaceNoteIndexV1 {
  const { [input.relativePath]: _removed, ...remainingFiles } = input.index.files;

  return {
    ...input.index,
    updatedAt: input.now,
    files: remainingFiles,
  };
}
