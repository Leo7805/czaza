/**
 * Provides single-line AI analysis using the new AI model DTOs.
 */

import type { AiClient } from "@shared/ai/aiClient";
import type { LineAnalysis } from "@shared/models/ai/line";
import { normalizeLineAnalysis } from "@shared/services/normalizers/aiAnalysisNormalizer";
import { parseAiJsonObject } from "@shared/services/normalizers/aiResponseNormalizer";

/**
 * Requests and normalizes single-line AI analysis.
 *
 * @param prompt - Complete prompt for the single-line AI request.
 * @param aiClient - AI client used to complete the generated prompt.
 * @returns Normalized line analysis DTO.
 *
 * @example
 * const analysis = await explainLineService("Explain this line as JSON.", aiClient);
 */
export async function explainLineService(
  prompt: string,
  aiClient: AiClient,
): Promise<LineAnalysis> {
  const responseText = await aiClient.complete(prompt);
  const parsedResponse = parseAiJsonObject(responseText);

  return normalizeLineAnalysis(parsedResponse);
}
