/**
 * Shared persistence fields for stored code notes.
 */

/**
 * Common persistence metadata shared by stored code notes.
 *
 * File, structure, and line note store models can all
 * extend these fields.
 */
export type StoreNoteFields = {
  /** ISO 8601 timestamp for when the note was first created. */
  createdAt: string;

  /** ISO 8601 timestamp for when the note was last updated. */
  updatedAt: string;
};
