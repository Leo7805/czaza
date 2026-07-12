/**
 * Store models for file-level code notes.
 */

import type { FileNote } from "@shared/models/domain/file";
import type { StoreNoteFields } from "./common";

/**
 * Persisted note attached to an entire source file.
 *
 * This model combines the file-note domain data
 * with common persistence metadata.
 */
export type StoredFileNote = FileNote & StoreNoteFields;
