/**
 * Provides immutable updates for workspace note index entries.
 */

import type { WorkspaceNoteIndexV2 } from "@shared/models/store/workspace";

/**
 * Renames or moves one source-file index entry.
 *
 * The note file path is preserved so the existing per-file note JSON stays
 * attached to the renamed source file.
 *
 * @param index - Workspace note index to update.
 * @param oldRelativePath - Existing workspace-relative source file path.
 * @param newRelativePath - Next workspace-relative source file path.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated workspace note index.
 * @throws Error when the old path is missing or the new path already exists.
 *
 * @example
 * const next = renameSourceFileEntry(index, "src/old.ts", "src/new.ts", now);
 */
export function renameSourceFileEntry(
  index: WorkspaceNoteIndexV2,
  oldRelativePath: string,
  newRelativePath: string,
  now: string,
): WorkspaceNoteIndexV2 {
  const existingEntry = index.files[oldRelativePath];

  if (!existingEntry) {
    throw new Error(`Cannot rename source file note entry because the old path is missing: ${oldRelativePath}`);
  }

  if (oldRelativePath !== newRelativePath && index.files[newRelativePath]) {
    throw new Error(`Cannot rename source file note entry because the new path already exists: ${newRelativePath}`);
  }

  const remainingFiles = { ...index.files };
  delete remainingFiles[oldRelativePath];

  return {
    ...index,
    updatedAt: now,
    files: {
      ...remainingFiles,
      [newRelativePath]: {
        ...existingEntry,
        updatedAt: now,
      },
    },
  };
}

/**
 * Deletes one source-file index entry.
 *
 * This only removes the index reference. It does not delete the per-file note
 * JSON from disk; physical cleanup belongs to repository or maintenance code.
 *
 * @param index - Workspace note index to update.
 * @param relativePath - Workspace-relative source file path to remove.
 * @param now - ISO 8601 timestamp used for updatedAt when an entry is removed.
 * @returns Updated workspace note index.
 *
 * @example
 * const next = deleteSourceFileEntry(index, "src/old.ts", now);
 */
export function deleteSourceFileEntry(
  index: WorkspaceNoteIndexV2,
  relativePath: string,
  now: string,
): WorkspaceNoteIndexV2 {
  if (!index.files[relativePath]) {
    return index;
  }

  const remainingFiles = { ...index.files };
  delete remainingFiles[relativePath];

  return {
    ...index,
    updatedAt: now,
    files: remainingFiles,
  };
}
