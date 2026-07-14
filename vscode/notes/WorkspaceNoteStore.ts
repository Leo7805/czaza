/**
 * Composes workspace note managers with one shared in-memory cache.
 */

import { WorkspaceNoteConfirmationManager } from "./WorkspaceNoteConfirmationManager";
import { WorkspaceNoteCrudManager } from "./WorkspaceNoteCrudManager";
import { WorkspaceNoteDetectionManager } from "./WorkspaceNoteDetectionManager";
import { WorkspaceNoteSourceIndexManager } from "./WorkspaceNoteSourceIndexManager";
import { WorkspaceNoteStoreCache } from "./WorkspaceNoteStoreCache";
import { WorkspaceNoteStoreRepository } from "./WorkspaceNoteStoreRepository";
import { WorkspaceNoteUpdateManager } from "./WorkspaceNoteUpdateManager";

/**
 * Root workspace note store container.
 *
 * This class owns one cache instance and wires all feature managers to it, so
 * reads and writes stay consistent across detection, CRUD, update, confirmation,
 * and source-index operations.
 *
 * @example
 * const notes = new WorkspaceNoteStore();
 * const result = await notes.detection.checkEntireSourceFileNotes(root, ".czaza", "src/index.ts", sourceText);
 */
export class WorkspaceNoteStore {
  /** Shared cache used by every feature manager. */
  readonly cache: WorkspaceNoteStoreCache;

  /** Anchor confirmation operations. */
  readonly confirmation: WorkspaceNoteConfirmationManager;

  /** File, section, and line note CRUD operations. */
  readonly crud: WorkspaceNoteCrudManager;

  /** Source-file note detection operations. */
  readonly detection: WorkspaceNoteDetectionManager;

  /** Source-file index operations. */
  readonly sourceIndex: WorkspaceNoteSourceIndexManager;

  /** Fine-grained status, anchor, and content update operations. */
  readonly update: WorkspaceNoteUpdateManager;

  /**
   * Creates a workspace note store with one shared cache.
   *
   * @param repository - Repository used for filesystem reads and writes.
   *
   * @example
   * const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository());
   */
  constructor(repository = new WorkspaceNoteStoreRepository()) {
    this.cache = new WorkspaceNoteStoreCache(repository);
    this.confirmation = new WorkspaceNoteConfirmationManager(this.cache);
    this.crud = new WorkspaceNoteCrudManager(this.cache);
    this.detection = new WorkspaceNoteDetectionManager(this.cache);
    this.sourceIndex = new WorkspaceNoteSourceIndexManager(this.cache);
    this.update = new WorkspaceNoteUpdateManager(this.cache);
  }
}
