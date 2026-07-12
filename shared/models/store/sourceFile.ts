/**
 * Store model containing all notes associated with one source file.
 */

import type { StoredFileNote } from "./file";
import type { StoredLineNote } from "./line";
import type { StoredSectionNote } from "./section";

/**
 * VS Code language identifier stored for source metadata.
 *
 * This value is intentionally open-ended because VS Code extensions may
 * contribute additional language ids, and CZaza relies on AI rather than a
 * fixed compiler AST pipeline for source understanding.
 */
export type ProgrammingLanguage = string;

/**
 * Metadata describing the source file that owns the stored notes.
 *
 * @example
 * const source: StoredSourceMetadata = {
 *   hash: "sha256:abc123",
 *   programmingLanguage: "typescriptreact",
 * };
 */
export type StoredSourceMetadata = {
  /**
   * Hash of the source content when the notes were last synchronised
   * with the file.
   */
  hash: string;

  /**
   * VS Code TextDocument.languageId for this source file.
   *
   * This is source-file metadata, not AI-generated analysis content.
   */
  programmingLanguage?: ProgrammingLanguage;
};

/**
 * All persisted notes associated with one source file.
 *
 * The source file path is stored as the key in the workspace note store.
 *
 * @example
 * const file: StoredSourceFile = {
 *   source: {
 *     hash: "sha256:abc123",
 *     programmingLanguage: "typescriptreact",
 *   },
 *   sectionNotes: [],
 *   lineNotes: [],
 * };
 */
export type StoredSourceFile = {
  /** Metadata for the source file that owns these notes. */
  source: StoredSourceMetadata;

  /** File-level note, when one exists. */
  fileNote?: StoredFileNote;

  /** Notes attached to meaningful code sections. */
  sectionNotes: StoredSectionNote[];

  /** Notes attached to individual source lines. */
  lineNotes: StoredLineNote[];
};
