/**
 * Store models for code section notes.
 */

import type { SectionNote } from "@shared/models/domain/section";
import type { StoreNoteFields } from "./common";

/**
 * Persisted note attached to a meaningful code section.
 *
 * This model combines the section-note domain data
 * with common persistence metadata.
 */
export type StoredSectionNote = SectionNote & StoreNoteFields;
