/**
 * Provides normalized AI analysis for one existing source section.
 */

import type { AiClient } from "@shared/ai/aiClient";
import type { SectionAnalysis } from "@shared/models/ai/section";
import { normalizeSectionAnalyses } from "@shared/services/normalizers/aiAnalysisNormalizer";
import { parseAiJsonObject, toRecord } from "@shared/services/normalizers/aiResponseNormalizer";

/** Validation context for one selected-section response. */
export type ExplainSelectedSectionServiceContext = {
  /** Current source line count used to validate the returned range. */
  lineCount: number;
};

/**
 * Requests and normalizes exactly one selected-section analysis.
 *
 * @param prompt - Prompt containing the complete file and selected section.
 * @param aiClient - AI client used to complete the prompt.
 * @param context - Current source range validation context.
 * @returns One normalized section analysis.
 * @throws Error when the AI does not return exactly one valid section.
 *
 * @example
 * const section = await explainSelectedSectionService(
 *   "Return one section JSON.",
 *   aiClient,
 *   { lineCount: 40 },
 * );
 */
export async function explainSelectedSectionService(
  prompt: string,
  aiClient: AiClient,
  context: ExplainSelectedSectionServiceContext,
): Promise<SectionAnalysis> {
  const responseText = await aiClient.complete(prompt);
  const record = toRecord(parseAiJsonObject(responseText));
  const sections = normalizeSectionAnalyses(record.sections, {
    responseName: "selected section analysis",
    lineCount: context.lineCount,
  });

  if (sections.length !== 1 || !sections[0]) {
    throw new Error("Invalid selected section analysis response: exactly one section is required.");
  }

  return sections[0];
}
