/**
 * AI-generated analysis models for individual source lines.
 */

import type { AIExplanation } from "./common";

/**
 * AI-generated explanation for one source line.
 *
 * The source line location is provided by the application
 * and is not part of the AI-generated content.
 *
 * @example
 * const analysis: LineAnalysis = {
 *   summary: "Sends the prompt to the configured AI client.",
 *   detail: "This line delegates model execution to the AiClient abstraction and receives raw response text.",
 *   aiNotes: ["Line number and source text are stored by the domain or store layer, not by this AI DTO."],
 * };
 */
export type LineAnalysis = AIExplanation;

/**
 * AI-generated analysis entry for one line in a batch line-analysis response.
 *
 * Batch analysis includes the line number because AI returns multiple line
 * analyses in one response and the application must match each explanation
 * back to its source line. The source text itself is still provided by the
 * application and is not part of this DTO.
 *
 * @example
 * const entry: LineAnalysisEntry = {
 *   lineNumber: 12,
 *   summary: "Returns the configured AI client.",
 *   detail: "This line returns an object implementing AiClient by delegating prompt completion to DeepSeek.",
 *   aiNotes: ["The source text is stored by the domain or store layer."],
 * };
 */
export type LineAnalysisEntry = {
  /**
   * One-based source line number for this AI-generated explanation.
   *
   * @example
   * 12
   */
  lineNumber: number;
} & LineAnalysis;
