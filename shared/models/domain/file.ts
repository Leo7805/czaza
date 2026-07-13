/**
 * Domain note models for an entire source file.
 */

import type { FileAnalysis } from "@shared/models/ai/file";
import type { DomainNoteFields } from "./common";

/**
 * A persistent note attached to an entire source file.
 *
 * The user note and AI explanation are independent and optional.
 *
 * @example
 * const note: FileNote = {
 *   id: "file",
 *   aiExplanation: {
 *     summary: "Defines the DeepSeek provider.",
 *     detail: "The file creates a DeepSeek-backed AiClient and formats provider errors.",
 *   },
 *   status: {
 *     content: "current",
 *     anchor: "confirmed",
 *   },
 *   createdBy: "ai",
 * };
 */
export type FileNote = DomainNoteFields<FileAnalysis> & {
  /**
   * Stable identifier for the file note.
   *
   * @example
   * "file"
   */
  id: string;

  /**
   * How the file note was originally created.
   *
   * @example
   * "ai"
   */
  createdBy: "user" | "ai";
};
