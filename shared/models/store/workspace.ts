/**
 * Top-level workspace note index models.
 */

import type { ProgrammingLanguage } from "./sourceFile";

/**
 * Index entry pointing from a source file path to its stored note file.
 *
 * @example
 * const entry: WorkspaceNoteFileIndexEntry = {
 *   noteFile: "files/abc123.json",
 *   sourceHash: "sha256:abc123",
 *   programmingLanguage: "typescriptreact",
 *   updatedAt: "2026-07-13T00:00:00.000Z",
 * };
 */
export type WorkspaceNoteFileIndexEntry = {
  /**
   * Path to the per-source-file note JSON, relative to `.czaza/notes`.
   *
   * @example
   * "files/abc123.json"
   */
  noteFile: string;

  /**
   * Hash of the source content when this index entry was last updated.
   *
   * @example
   * "sha256:abc123"
   */
  sourceHash: string;

  /**
   * VS Code TextDocument.languageId for this source file, when available.
   *
   * @example
   * "typescriptreact"
   */
  programmingLanguage?: ProgrammingLanguage;

  /**
   * ISO 8601 timestamp for when this file index entry was last updated.
   *
   * @example
   * "2026-07-13T00:00:00.000Z"
   */
  updatedAt: string;
};

/**
 * Top-level persistent note index for one workspace.
 *
 * @example
 * const index: WorkspaceNoteIndexV2 = {
 *   schemaVersion: 2,
 *   updatedAt: "2026-07-13T00:00:00.000Z",
 *   workspaceRoot: "/workspace/project",
 *   files: {
 *     "src/Button.tsx": {
 *       noteFile: "files/abc123.json",
 *       sourceHash: "sha256:abc123",
 *       programmingLanguage: "typescriptreact",
 *       updatedAt: "2026-07-13T00:00:00.000Z",
 *     },
 *   },
 * };
 */
export type WorkspaceNoteIndexV2 = {
  /** Version of the complete workspace note-store schema. */
  schemaVersion: 2;

  /**
   * ISO 8601 timestamp for when the store file was last written.
   *
   * @example
   * "2026-07-13T00:00:00.000Z"
   */
  updatedAt: string;

  /**
   * Optional normalized workspace root used for debugging and migration checks.
   *
   * The persisted file path key remains the source of truth for individual
   * source files, so this field is not required for note lookup.
   *
   * @example
   * "/workspace/project"
   */
  workspaceRoot?: string;

  /**
   * Source-file note files indexed by workspace-relative source file path.
   *
   * The key carries the source path, and the value points to the per-file note JSON.
   */
  files: Record<string, WorkspaceNoteFileIndexEntry>;
};
