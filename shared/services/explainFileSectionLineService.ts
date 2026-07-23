/**
 * Provides coordinated file, section, and line AI analysis in one request.
 */

import type { AiClient } from "@shared/ai/aiClient";
import type { FileAnalysis } from "@shared/models/ai/file";
import type { LineAnalysisEntry } from "@shared/models/ai/line";
import type { SectionAnalysis } from "@shared/models/ai/section";
import {
  normalizeFileAnalysis,
  normalizeLineAnalysisEntries,
  normalizeSectionAnalyses,
} from "@shared/services/normalizers/aiAnalysisNormalizer";
import {
  parseAiJsonObject,
  toRecord,
} from "@shared/services/normalizers/aiResponseNormalizer";
import { completeStructuredAiResponse } from "@shared/services/structuredAiResponseService";

/**
 * Coordinated AI analysis for all three source-code levels.
 *
 * @example
 * const analysis: FileSectionLineAnalysis = {
 *   file: { summary: "Runs a task.", detail: "The file defines and invokes a task." },
 *   sections: [],
 *   lines: [],
 * };
 */
export type FileSectionLineAnalysis = {
  /** Whole-file AI analysis. */
  file: FileAnalysis;

  /** AI-generated meaningful sections for the same file. */
  sections: SectionAnalysis[];

  /** AI analysis for the exact locally selected source lines. */
  lines: LineAnalysisEntry[];
};

/**
 * Required source validation context for coordinated analysis.
 */
export type ExplainFileSectionLineServiceContext = {
  /** Current source line count used to validate all returned locations. */
  lineCount: number;

  /** Exact locally filtered line numbers requested from the AI. */
  requestedLineNumbers: readonly number[];
};

/**
 * Requests and normalizes coordinated file, section, and line AI analysis.
 *
 * Context is validated before the AI request. The function returns only after
 * all three response levels pass normalization, so callers never receive a
 * partial aggregate result.
 *
 * @param prompt - Complete prompt for coordinated three-level analysis.
 * @param aiClient - AI client used to complete the prompt.
 * @param context - Required source line count and exact requested line numbers.
 * @returns Normalized file, section, and line analysis DTOs.
 *
 * @example
 * const analysis = await explainFileSectionLineService(prompt, aiClient, {
 *   lineCount: 120,
 *   requestedLineNumbers: [8, 12],
 * });
 */
export async function explainFileSectionLineService(
  prompt: string,
  aiClient: AiClient,
  context: ExplainFileSectionLineServiceContext,
): Promise<FileSectionLineAnalysis> {
  validateContext(context);

  return completeStructuredAiResponse({
    prompt,
    aiClient,
    responseName: "file section line analysis",
    parseAndValidate(responseText) {
      const record = toRecord(parseAiJsonObject(responseText));
      return {
        file: normalizeFileAnalysis(record.file, {
          responseName: "file section line analysis",
          fieldName: "file",
        }),
        sections: normalizeSectionAnalyses(record.sections, {
          responseName: "file section line analysis",
          lineCount: context.lineCount,
        }),
        lines: normalizeLineAnalysisEntries(record.lines, {
          responseName: "file section line analysis",
          requestedLineNumbers: context.requestedLineNumbers,
        }),
      };
    },
  });
}

/** Validates source constraints before spending an AI request. */
function validateContext(context: ExplainFileSectionLineServiceContext): void {
  if (!Number.isInteger(context.lineCount) || context.lineCount < 1) {
    throw new RangeError(
      "Invalid file section line analysis context: lineCount must be a positive integer.",
    );
  }

  const lineNumbers = new Set<number>();

  for (const lineNumber of context.requestedLineNumbers) {
    if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > context.lineCount) {
      throw new RangeError(
        `Invalid file section line analysis context: requested lineNumber ${lineNumber} is outside the source range.`,
      );
    }

    if (lineNumbers.has(lineNumber)) {
      throw new RangeError(
        `Invalid file section line analysis context: duplicate requested lineNumber ${lineNumber}.`,
      );
    }

    lineNumbers.add(lineNumber);
  }
}
