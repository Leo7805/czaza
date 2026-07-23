/**
 * Provides batch line AI analysis using the new AI model DTOs.
 */

import type { AiClient } from "@shared/ai/aiClient";
import type { LineAnalysisEntry } from "@shared/models/ai/line";
import { normalizeLineAnalysisEntries } from "@shared/services/normalizers/aiAnalysisNormalizer";
import {
  parseAiJsonObject,
  toRecord,
} from "@shared/services/normalizers/aiResponseNormalizer";
import { completeStructuredAiResponse } from "@shared/services/structuredAiResponseService";

/**
 * Optional validation context for batch line analysis.
 */
export type ExplainLineBatchServiceContext = {
  /** Line numbers that were requested from the AI. */
  requestedLineNumbers?: readonly number[];
};

/**
 * Requests and normalizes batch line AI analysis.
 *
 * @param prompt - Complete prompt for the batch line AI request.
 * @param aiClient - AI client used to complete the generated prompt.
 * @param context - Optional validation context for returned line numbers.
 * @returns Normalized line analysis entries sorted by line number.
 *
 * @example
 * const lines = await explainLineBatchService("Return line JSON.", aiClient, {
 *   requestedLineNumbers: [2, 3],
 * });
 */
export async function explainLineBatchService(
  prompt: string,
  aiClient: AiClient,
  context?: ExplainLineBatchServiceContext,
): Promise<LineAnalysisEntry[]> {
  return completeStructuredAiResponse({
    prompt,
    aiClient,
    responseName: "line batch analysis",
    parseAndValidate(responseText) {
      const record = toRecord(parseAiJsonObject(responseText));
      return normalizeLineAnalysisEntries(record.lines, {
        responseName: "line batch analysis",
        requestedLineNumbers: context?.requestedLineNumbers,
      });
    },
  });
}
