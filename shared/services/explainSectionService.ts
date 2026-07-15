/**
 * Provides section-level AI analysis using the new AI model DTOs.
 */

import type { AiClient } from "@shared/ai/aiClient";
import type { SectionAnalysis } from "@shared/models/ai/section";
import { normalizeSectionAnalyses } from "@shared/services/normalizers/aiAnalysisNormalizer";
import {
  parseAiJsonObject,
  toRecord,
} from "@shared/services/normalizers/aiResponseNormalizer";

/**
 * Validation context for section-level AI analysis.
 */
export type ExplainSectionServiceContext = {
  /** Current source line count used to validate AI-generated section ranges. */
  lineCount: number;
};

/**
 * Requests and normalizes section-level AI analysis.
 *
 * @param prompt - Complete prompt for the section-level AI request.
 * @param aiClient - AI client used to complete the generated prompt.
 * @param context - Optional source validation context for section ranges.
 * @returns Normalized section analysis DTOs.
 *
 * @example
 * const sections = await explainSectionService("Return section JSON.", aiClient, {
 *   lineCount: 120,
 * });
 */
export async function explainSectionService(
  prompt: string,
  aiClient: AiClient,
  context?: ExplainSectionServiceContext,
): Promise<SectionAnalysis[]> {
  const responseText = await aiClient.complete(prompt);
  const record = toRecord(parseAiJsonObject(responseText));

  return normalizeSectionAnalyses(record.sections, {
    responseName: "section analysis",
    lineCount: context?.lineCount,
  });
}
