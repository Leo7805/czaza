/**
 * Shared domain types for persistent code notes.
 */

/**
 * Indicates whether a note still describes the current source code.
 */
export type NoteContentStatus = "current" | "stale";

/**
 * Indicates whether a note is still attached to the correct code target.
 */
export type NoteAnchorStatus = "confirmed" | "needsConfirmation" | "orphaned";

/**
 * Shared status information for a persistent code note.
 */
export type NoteStatus = {
  /** Whether the note content still matches the current code. */
  content: NoteContentStatus;

  /** Whether the note is attached to the correct code target. */
  anchor: NoteAnchorStatus;
};

/**
 * Common domain fields shared by persistent code notes.
 */
export type DomainNoteFields<TAIExplanation> = {
  /**
   * User-written note content.
   *
   * The content may contain multiple paragraphs or Markdown.
   */
  userNote?: string;

  /** AI-generated explanation, when available. */
  aiExplanation?: TAIExplanation;

  /** Current content and code-target status. */
  status: NoteStatus;
};
