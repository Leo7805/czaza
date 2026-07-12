/**
 * Top-level persistent note store for one workspace.
 */

import type { StoredSourceFile } from "./sourceFile";

/**
 * Top-level persistent note store for one workspace.
 *
 * @example
 * const store: WorkspaceNoteStoreV1 = {
 *   schemaVersion: 1,
 *   files: {
 *     "src/Button.tsx": {
 *       source: {
 *         hash: "sha256:abc123",
 *         programmingLanguage: "typescriptreact",
 *       },
 *       sectionNotes: [],
 *       lineNotes: [],
 *     },
 *   },
 * };
 */
export type WorkspaceNoteStoreV1 = {
  /** Version of the persisted storage schema. */
  schemaVersion: 1;

  /**
   * Source-file notes indexed by workspace-relative source file path.
   *
   * The key carries the file path, so individual file entries do not repeat it.
   */
  files: Record<string, StoredSourceFile>;
};
