/**
 * AI-generated analysis models for an entire source file.
 */

import type { AIExplanation } from "./common";

/**
 * AI-generated analysis for an entire source file.
 *
 * File analysis currently uses the shared AI explanation structure
 * without adding file-specific fields.
 *
 * @example
 * const analysis: FileAnalysis = {
 *   summary: "Defines the file-level AI analysis service.",
 *   detail: "The file sends a prepared prompt to an AI client and validates the returned file analysis JSON.",
 *   aiNotes: ["The service does not store file path or programming language metadata."],
 * };
 */
export type FileAnalysis = AIExplanation;
