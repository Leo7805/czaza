/**
 * Provides file-level AI analysis using the new AI model DTOs.
 */

import type { AiClient } from "@shared/ai/aiClient";
import type { FileAnalysis } from "@shared/models/ai/file";
import { normalizeFileAnalysis } from "@shared/services/normalizers/aiAnalysisNormalizer";
import { parseAiJsonObject } from "@shared/services/normalizers/aiResponseNormalizer";

/**
 * Requests and normalizes file-level AI analysis.
 *
 * @param prompt - Complete prompt for the file-level AI request.
 * @param aiClient - AI client used to complete the generated prompt.
 * @returns Normalized file analysis DTO.
 *
 * @example
 * const analysis = await explainFileService("Explain this file as JSON.", aiClient);
 */
export async function explainFileService(
  prompt: string,
  aiClient: AiClient,
): Promise<FileAnalysis> {
  const responseText = await aiClient.complete(prompt);
  const parsedResponse = parseAiJsonObject(responseText);

  return normalizeFileAnalysis(parsedResponse);
}
