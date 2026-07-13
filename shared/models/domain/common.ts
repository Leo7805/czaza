/**
 * Shared domain types for persistent code notes.
 */

/**
 * Indicates whether a note still describes the current source code.
 *
 * @example
 * const status: NoteContentStatus = "current";
 */
export type NoteContentStatus = "current" | "stale";

/**
 * Indicates whether a note is still attached to the correct code target.
 *
 * @example
 * const status: NoteAnchorStatus = "confirmed";
 */
export type NoteAnchorStatus = "confirmed" | "needsConfirmation" | "orphaned";

/**
 * Shared status information for a persistent code note.
 *
 * @example
 * const status: NoteStatus = {
 *   content: "current",
 *   anchor: "confirmed",
 * };
 */
export type NoteStatus = {
  /**
   * Whether the note content still matches the current code.
   *
   * @example
   * "stale"
   */
  content: NoteContentStatus;

  /**
   * Whether the note is attached to the correct code target.
   *
   * @example
   * "needsConfirmation"
   */
  anchor: NoteAnchorStatus;
};

/**
 * Common domain fields shared by persistent code notes.
 *
 * @example
 * const fields: DomainNoteFields<{ summary: string; detail: string }> = {
 *   userNote: "This part controls the request timeout.",
 *   aiExplanation: {
 *     summary: "Configures the timeout.",
 *     detail: "The code stores the timeout used by outgoing AI requests.",
 *   },
 *   status: {
 *     content: "current",
 *     anchor: "confirmed",
 *   },
 * };
 */
export type DomainNoteFields<TAIAnalysis> = {
  /**
   * User-written note content.
   *
   * The content may contain multiple paragraphs or Markdown.
   */
  userNote?: string;

  /**
   * AI-generated explanation, when available.
   *
   * @example
   * { summary: "Reads settings.", detail: "The code validates user settings." }
   */
  aiExplanation?: TAIAnalysis;

  /**
   * Current content and code-target status.
   *
   * @example
   * { content: "current", anchor: "confirmed" }
   */
  status: NoteStatus;
};

/**
 * Creates the default status for a freshly generated domain note.
 *
 * @returns New status object marking both content and anchor as current.
 *
 * @example
 * const status = createCurrentConfirmedStatus();
 */
export function createCurrentConfirmedStatus(): NoteStatus {
  return {
    content: "current",
    anchor: "confirmed",
  };
}
