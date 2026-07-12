/**
 * Store model containing all notes associated with one source file.
 */

import type { StoredFileNote } from "./file";
import type { StoredLineNote } from "./line";
import type { StoredSectionNote } from "./section";

/**
 * All persisted notes associated with one source file.
 *
 * The source file path is stored as the key in the workspace note store.
 */
export type StoredSourceFile = {
  /**
   * Hash of the source content when the notes
   * were last synchronised with the file.
   */
  sourceHash: string;

  /** File-level note, when one exists. */
  fileNote?: StoredFileNote;

  /** Notes attached to meaningful code sections. */
  sectionNotes: StoredSectionNote[];

  /** Notes attached to individual source lines. */
  lineNotes: StoredLineNote[];
};
