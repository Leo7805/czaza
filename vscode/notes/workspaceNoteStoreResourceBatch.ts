/**
 * Plans and executes aggregate Note Store changes for file or directory resources.
 */

import type { WorkspaceNoteIndexV2 } from "@shared/models/store/workspace";
import { isCzazaNoteStoreRelativePath } from "@shared/utils/managedOutputPath";
import type { WorkspaceNoteStoreCache } from "./WorkspaceNoteStoreCache";
import type {
  MarkSourceFileEntryDeletedResult,
  MoveSourceFileEntryResult,
} from "./workspaceNoteStoreResources";

/** Result of moving every tracked source entry at or below one resource path. */
export type MoveSourceEntriesUnderPathResult =
  | {
      kind: "moved";
      entries: readonly SourceEntryMove[];
    }
  | Exclude<MoveSourceFileEntryResult, { kind: "moved" }>;

/** Result of marking every tracked source entry at or below one path deleted. */
export type MarkSourceEntriesUnderPathDeletedResult =
  | {
      kind: "markedDeleted";
      relativePaths: readonly string[];
    }
  | {
      kind: "notFound";
      relativePath: string;
    };

/** One planned source entry path transformation. */
type SourceEntryMove = {
  previousRelativePath: string;
  nextRelativePath: string;
};

/**
 * Moves all tracked source entries at or below one resource path.
 *
 * @param input - Store scope, path mapping, timestamp, and single-entry operation.
 * @returns Aggregate move result.
 */
export async function moveSourceEntriesUnderPath(input: {
  cache: WorkspaceNoteStoreCache;
  workspaceRoot: string;
  outputDirectory: string;
  previousRelativePath: string;
  nextRelativePath: string;
  now: string;
  moveEntry(
    previousRelativePath: string,
    nextRelativePath: string,
  ): Promise<MoveSourceFileEntryResult>;
}): Promise<MoveSourceEntriesUnderPathResult> {
  const index = await input.cache.loadIndex(input.workspaceRoot, input.outputDirectory);
  const entries = getEntriesUnderPath(index, input.previousRelativePath);

  if (entries.length === 0) {
    return { kind: "notFound", previousRelativePath: input.previousRelativePath };
  }

  const moves = entries.map((relativePath) => ({
    previousRelativePath: relativePath,
    nextRelativePath: replacePathPrefix(
      relativePath,
      input.previousRelativePath,
      input.nextRelativePath,
    ),
  }));
  const sourcePaths = new Set(entries);

  for (const move of moves) {
    if (
      isCzazaNoteStoreRelativePath(
        input.workspaceRoot,
        input.outputDirectory,
        move.nextRelativePath,
      )
    ) {
      return { kind: "protectedPath", nextRelativePath: move.nextRelativePath };
    }

    if (index?.files[move.nextRelativePath] && !sourcePaths.has(move.nextRelativePath)) {
      return { kind: "conflict", nextRelativePath: move.nextRelativePath };
    }
  }

  moves.sort(
    (left, right) =>
      right.previousRelativePath.split("/").length -
      left.previousRelativePath.split("/").length,
  );

  for (const move of moves) {
    const result = await input.moveEntry(
      move.previousRelativePath,
      move.nextRelativePath,
    );

    if (result.kind !== "moved") {
      return result;
    }
  }

  return { kind: "moved", entries: moves };
}

/**
 * Marks all tracked source entries at or below one resource path deleted.
 *
 * @param input - Store scope, deleted path, and single-entry operation.
 * @returns Aggregate deletion-marking result.
 */
export async function markSourceEntriesUnderPathDeleted(input: {
  cache: WorkspaceNoteStoreCache;
  workspaceRoot: string;
  outputDirectory: string;
  relativePath: string;
  markEntryDeleted(relativePath: string): Promise<MarkSourceFileEntryDeletedResult>;
}): Promise<MarkSourceEntriesUnderPathDeletedResult> {
  const index = await input.cache.loadIndex(input.workspaceRoot, input.outputDirectory);
  const relativePaths = getEntriesUnderPath(index, input.relativePath);

  if (relativePaths.length === 0) {
    return { kind: "notFound", relativePath: input.relativePath };
  }

  for (const relativePath of relativePaths) {
    await input.markEntryDeleted(relativePath);
  }

  return { kind: "markedDeleted", relativePaths };
}

/**
 * Lists tracked entries equal to or contained by one normalized resource path.
 *
 * @param index - Optional workspace Note index.
 * @param relativePath - File or directory path to match.
 * @returns Matching relative paths in stable lexical order.
 */
function getEntriesUnderPath(
  index: WorkspaceNoteIndexV2 | null,
  relativePath: string,
): string[] {
  const normalizedPath = normalizeRelativePath(relativePath);
  const prefix = normalizedPath === "." ? "" : `${normalizedPath}/`;

  return Object.keys(index?.files ?? {})
    .filter(
      (candidate) =>
        candidate === normalizedPath ||
        (prefix.length > 0 && candidate.startsWith(prefix)),
    )
    .sort((left, right) => left.localeCompare(right));
}

/**
 * Replaces a matched resource prefix while preserving its descendant suffix.
 *
 * @param relativePath - Tracked source path.
 * @param previousPrefix - Existing file or directory path.
 * @param nextPrefix - Replacement file or directory path.
 * @returns Moved source path.
 */
function replacePathPrefix(
  relativePath: string,
  previousPrefix: string,
  nextPrefix: string,
): string {
  const source = normalizeRelativePath(relativePath);
  const previous = normalizeRelativePath(previousPrefix);
  const next = normalizeRelativePath(nextPrefix);
  const suffix = source === previous ? "" : source.slice(previous.length + 1);

  return normalizeRelativePath(suffix ? `${next}/${suffix}` : next);
}

/**
 * Normalizes one relative path to portable forward-slash form.
 *
 * @param value - Relative path to normalize.
 * @returns Portable normalized relative path.
 */
function normalizeRelativePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "") || ".";
}
