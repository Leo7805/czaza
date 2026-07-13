/**
 * Domain note models for individual source lines.
 */

import type { LineAnalysis } from "@shared/models/ai/line";
import type { DomainNoteFields } from "./common";

/**
 * A persistent note attached to one source line.
 *
 * A line note may be created manually by the user
 * or generated from an AI line analysis.
 *
 * @example
 * const note: LineNote = {
 *   id: "line:42",
 *   line: 42,
 *   anchorText: "return response.choices?.[0]?.message?.content ?? \"\";",
 *   aiExplanation: {
 *     summary: "Returns the assistant response text.",
 *     detail: "The line safely reads the first message content and falls back to an empty string.",
 *   },
 *   status: {
 *     content: "current",
 *     anchor: "confirmed",
 *   },
 *   createdBy: "ai",
 * };
 */
export type LineNote = DomainNoteFields<LineAnalysis> & {
  /**
   * Stable identifier for the line note.
   *
   * @example
   * "line:42"
   */
  id: string;

  /**
   * Current one-based source line number.
   *
   * @example
   * 42
   */
  line: number;

  /**
   * Source text captured when the line attachment
   * was last confirmed.
   *
   * @example
   * "return response.choices?.[0]?.message?.content ?? \"\";"
   */
  anchorText: string;

  /**
   * How the line note was originally created.
   *
   * @example
   * "ai"
   */
  createdBy: "user" | "ai";
};
