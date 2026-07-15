/**
 * Provides combined file and section AI analysis using the new AI model DTOs.
 */

import type { AiClient } from "@shared/ai/aiClient";
import type { FileAnalysis } from "@shared/models/ai/file";
import type { SectionAnalysis } from "@shared/models/ai/section";
import {
  normalizeFileAnalysis,
  normalizeSectionAnalyses,
} from "@shared/services/normalizers/aiAnalysisNormalizer";
import {
  parseAiJsonObject,
  toRecord,
} from "@shared/services/normalizers/aiResponseNormalizer";

/**
 * Combined AI analysis for one source file.
 *
 * @example
 * const analysis: FileSectionAnalysis = {
 *   file: {
 *     summary: "Defines a reusable button component.",
 *     detail: "The file exports a React component that renders a styled button.",
 *   },
 *   sections: [
 *     {
 *       title: "Button rendering",
 *       range: { startLine: 1, endLine: 3 },
 *       summary: "Renders the button.",
 *       detail: "This section returns the JSX output.",
 *     },
 *   ],
 * };
 */
export type FileSectionAnalysis = {
  /** Whole-file AI analysis. */
  file: FileAnalysis;

  /** AI-generated meaningful sections for the same file. */
  sections: SectionAnalysis[];
};

/**
 * Optional validation context for combined file and section analysis.
 */
export type ExplainFileSectionServiceContext = {
  /** Current source line count used to validate AI-generated section ranges. */
  lineCount: number;
};

/**
 * Requests and normalizes combined file and section AI analysis.
 *
 * @param prompt - Complete prompt for the combined file and section AI request.
 * @param aiClient - AI client used to complete the generated prompt.
 * @param context - Optional source validation context for section ranges.
 * @returns Normalized file and section analysis DTOs.
 *
 * @example
 * const analysis = await explainFileSectionService(
 *   "Return file and section JSON.",
 *   aiClient,
 *   { lineCount: 120 },
 * );
 */
export async function explainFileSectionService(
  prompt: string,
  aiClient: AiClient,
  context?: ExplainFileSectionServiceContext,
): Promise<FileSectionAnalysis> {
  const responseText = await aiClient.complete(prompt);
  const record = toRecord(parseAiJsonObject(responseText));

  return {
    file: normalizeFileAnalysis(record.file, {
      responseName: "file section analysis",
      fieldName: "file",
    }),
    sections: normalizeSectionAnalyses(record.sections, {
      responseName: "file section analysis",
      lineCount: context?.lineCount,
    }),
  };
}
