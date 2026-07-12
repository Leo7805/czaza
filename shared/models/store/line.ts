/**
 * Store models for individual source-line notes.
 */

import type { LineNote } from "@shared/models/domain/line";
import type { StoreNoteFields } from "./common";

/**
 * Persisted note attached to one source line.
 *
 * This model combines the line-note domain data
 * with common persistence metadata.
 */
export type StoredLineNote = LineNote & StoreNoteFields;
