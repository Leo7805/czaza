/**
 * Provides a workspace Note Store whose Team or Personal identity is fixed for one workflow.
 */

import { WorkspaceNoteConfirmationManager } from "./WorkspaceNoteConfirmationManager";
import { WorkspaceNoteCrudManager } from "./WorkspaceNoteCrudManager";
import { WorkspaceNoteDetectionManager } from "./WorkspaceNoteDetectionManager";
import { WorkspaceNoteResourceManager } from "./workspaceNoteStoreResources";
import { WorkspaceNoteSourceIndexManager } from "./WorkspaceNoteSourceIndexManager";
import type { WorkspaceNoteStore } from "./WorkspaceNoteStore";
import type { NoteStoreLocation } from "./NoteStoreLocation";
import { getNoteStoreLocationKey } from "./NoteStoreLocation";
import { WorkspaceNoteUpdateManager } from "./WorkspaceNoteUpdateManager";

/** Owns Note Store managers bound to one project and Team or Personal location. */
export class ScopedWorkspaceNoteStore {
  readonly workspaceRoot: string;
  readonly outputDirectory: string;
  readonly location: NoteStoreLocation;
  readonly cache;
  readonly confirmation: WorkspaceNoteConfirmationManager;
  readonly crud: WorkspaceNoteCrudManager;
  readonly detection: WorkspaceNoteDetectionManager;
  readonly sourceIndex: WorkspaceNoteSourceIndexManager;
  readonly resources: WorkspaceNoteResourceManager;
  readonly update: WorkspaceNoteUpdateManager;

  /**
   * Creates a scoped view that shares the root Store cache and repository.
   *
   * @param notes - Root Store that owns shared cache state.
   * @param workspaceRoot - Absolute CZaza project root.
   * @param outputDirectory - Project-relative CZaza output directory.
   * @param location - Exact Team or Personal Note Store for every operation.
   */
  constructor(
    notes: WorkspaceNoteStore,
    workspaceRoot: string,
    outputDirectory: string,
    location: NoteStoreLocation,
  ) {
    this.workspaceRoot = workspaceRoot;
    this.outputDirectory = outputDirectory;
    this.location = location;
    this.cache = notes.cache.forLocation(location);
    this.confirmation = new WorkspaceNoteConfirmationManager(this.cache);
    this.crud = new WorkspaceNoteCrudManager(this.cache);
    this.detection = new WorkspaceNoteDetectionManager(this.cache);
    this.sourceIndex = new WorkspaceNoteSourceIndexManager(this.cache);
    this.resources = new WorkspaceNoteResourceManager(this.cache);
    this.update = new WorkspaceNoteUpdateManager(this.cache);
  }

  /**
   * Preserves structural compatibility while preventing a scoped workflow from changing identity.
   *
   * @param workspaceRoot - Requested absolute project root.
   * @param outputDirectory - Requested project-relative output directory.
   * @param location - Requested Team or Personal location.
   * @returns This scoped Store when every coordinate matches.
   */
  scope(
    workspaceRoot: string,
    outputDirectory: string,
    location: NoteStoreLocation,
  ): ScopedWorkspaceNoteStore {
    if (
      workspaceRoot !== this.workspaceRoot ||
      outputDirectory !== this.outputDirectory ||
      getNoteStoreLocationKey(location) !== getNoteStoreLocationKey(this.location)
    ) {
      throw new Error("A scoped Note Store cannot be rebound to another project or identity.");
    }

    return this;
  }
}
