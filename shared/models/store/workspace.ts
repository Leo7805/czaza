/**
 * Top-level persistent note store for one workspace.
 */

import type { StoredSourceFile } from "./sourceFile";

/**
 * Top-level persistent note store for one workspace.
 */
export type WorkspaceNoteStoreV1 = {
  /** Version of the persisted storage schema. */
  schemaVersion: 1;

  /** Notes indexed by workspace-relative source file path. */
  files: Record<string, StoredSourceFile>;
};
