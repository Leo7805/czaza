/**
 * AI-generated analysis models for meaningful code sections.
 */

import type { SectionDefinition } from "@shared/models/common";
import type { AIExplanation } from "./common";

/**
 * AI-generated analysis for one meaningful code section.
 *
 * A section is identified by title and source range, then explained with the
 * shared AI explanation fields. The range is produced by AI and should be
 * validated before storing or rendering.
 *
 * @example
 * const analysis: SectionAnalysis = {
 *   title: "DeepSeek request setup",
 *   kind: "network-request",
 *   range: {
 *     startLine: 24,
 *     endLine: 58,
 *   },
 *   summary: "Builds and sends the DeepSeek chat completion request.",
 *   detail: "This section creates an abortable fetch request, attaches authentication headers, and sends the prompt payload.",
 *   aiNotes: ["The range should be checked against the current source line count."],
 * };
 */
export type SectionAnalysis = SectionDefinition & AIExplanation;
