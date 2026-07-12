/**
 * Provides section-level AI analysis using the new AI model DTOs.
 */

import type { AiClient } from "@shared/ai/aiClient";
import type { LineRange } from "@shared/models/common";
import type { SectionAnalysis } from "@shared/models/ai/section";

/**
 * Validation context for section-level AI analysis.
 */
export type ExplainSectionServiceContext = {
  /**
   * Current source line count used to validate AI-generated section ranges.
   *
   * When omitted by the caller, the service validates only that section ranges
   * use positive one-based line numbers and are not reversed.
   */
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
 * const sections = await explainSectionService("Return section JSON.", aiClient);
 */
export async function explainSectionService(
  prompt: string,
  aiClient: AiClient,
  context?: ExplainSectionServiceContext,
): Promise<SectionAnalysis[]> {
  const responseText = await aiClient.complete(prompt);
  const parsedResponse = parseAiJsonObject(responseText);

  return normalizeSectionAnalyses(parsedResponse, context);
}

/**
 * Parses the JSON object from an AI response.
 *
 * @param value - Raw AI response text.
 * @returns Parsed JSON value.
 *
 * @example
 * const parsed = parseAiJsonObject('{"sections":[]}');
 */
function parseAiJsonObject(value: string): unknown {
  return JSON.parse(extractJsonObjectText(value)) as unknown;
}

/**
 * Extracts JSON object text from a raw AI response.
 *
 * @param value - Raw AI response text that may include a fenced JSON block.
 * @returns Text that should be parsed as JSON.
 *
 * @example
 * const json = extractJsonObjectText("```json\\n{}\\n```");
 */
function extractJsonObjectText(value: string): string {
  const trimmed = value.trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return unfenced;
  }

  return unfenced.slice(firstBrace, lastBrace + 1);
}

/**
 * Normalizes unknown AI output into section analysis DTOs.
 *
 * @param value - Parsed AI response payload.
 * @param context - Optional source validation context for section ranges.
 * @returns SectionAnalysis list sorted by start line.
 * @throws Error when the response shape or any section is invalid.
 *
 * @example
 * const sections = normalizeSectionAnalyses({ sections: [] });
 */
function normalizeSectionAnalyses(
  value: unknown,
  context?: ExplainSectionServiceContext,
): SectionAnalysis[] {
  const record = toRecord(value);

  if (!Array.isArray(record.sections)) {
    throw new Error("Invalid section analysis response: sections must be an array.");
  }

  return record.sections
    .map((section, index) => normalizeSectionAnalysis(section, index, context))
    .sort((left, right) => left.range.startLine - right.range.startLine);
}

/**
 * Normalizes one unknown section item into a SectionAnalysis DTO.
 *
 * @param value - Unknown section payload.
 * @param index - Section array index used in validation errors.
 * @param context - Optional source validation context for section ranges.
 * @returns Validated section analysis.
 * @throws Error when required fields are missing or invalid.
 *
 * @example
 * const section = normalizeSectionAnalysis(sectionJson, 0);
 */
function normalizeSectionAnalysis(
  value: unknown,
  index: number,
  context?: ExplainSectionServiceContext,
): SectionAnalysis {
  const record = toRecord(value);
  const title = nonEmptyString(record.title);
  const summary = nonEmptyString(record.summary);
  const detail = nonEmptyString(record.detail);
  const range = normalizeRange(record.range, context?.lineCount);

  if (!title || !summary || !detail || !range) {
    throw new Error(
      `Invalid section analysis response: section ${index} requires title, range, summary, and detail.`,
    );
  }

  const aiNotes = normalizeStringArray(record.aiNotes);
  const section: SectionAnalysis = {
    title,
    range,
    summary,
    detail,
  };
  const kind = nonEmptyString(record.kind);

  if (kind) {
    section.kind = kind;
  }

  if (aiNotes.length > 0) {
    section.aiNotes = aiNotes;
  }

  return section;
}

/**
 * Normalizes an unknown range-like value into a valid source range.
 *
 * @param value - Unknown range payload.
 * @param lineCount - Optional current source line count.
 * @returns Valid line range or undefined.
 *
 * @example
 * const range = normalizeRange({ startLine: 1, endLine: 5 });
 */
function normalizeRange(value: unknown, lineCount?: number): LineRange | undefined {
  const record = toRecord(value);
  const startLine = normalizeLineNumber(record.startLine, lineCount);
  const endLine = normalizeLineNumber(record.endLine, lineCount);

  if (!startLine || !endLine || startLine > endLine) {
    return undefined;
  }

  return {
    startLine,
    endLine,
  };
}

/**
 * Converts an unknown value into a valid one-based source line number.
 *
 * @param value - Unknown line number value.
 * @param lineCount - Optional current source line count.
 * @returns Valid line number or undefined.
 *
 * @example
 * const line = normalizeLineNumber("3");
 */
function normalizeLineNumber(value: unknown, lineCount?: number): number | undefined {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (
    !Number.isInteger(numberValue) ||
    numberValue < 1 ||
    (typeof lineCount === "number" && numberValue > lineCount)
  ) {
    return undefined;
  }

  return numberValue;
}

/**
 * Narrows an unknown value into a record for defensive field reads.
 *
 * @param value - Unknown parsed value.
 * @returns Object record or an empty object for non-object values.
 *
 * @example
 * const record = toRecord({ sections: [] });
 */
function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Returns a string only when it contains non-whitespace content.
 *
 * @param value - Unknown AI field value.
 * @returns Original string when it has content, otherwise undefined.
 *
 * @example
 * const title = nonEmptyString("Request setup");
 */
function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/**
 * Keeps only string entries from an unknown AI array field.
 *
 * @param value - Unknown AI field value.
 * @returns Array containing only string items.
 *
 * @example
 * const notes = normalizeStringArray(["ok", 1]);
 */
function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
