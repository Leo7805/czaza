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
 */
export type LineNote = DomainNoteFields<LineAnalysis> & {
  /** Stable identifier for the line note. */
  id: string;

  /** Current one-based source line number. */
  line: number;

  /**
   * Source text captured when the line attachment
   * was last confirmed.
   */
  anchorText: string;

  /** How the line note was originally created. */
  createdBy: "user" | "ai";
};
