/**
 * Provides batch line AI analysis using the new AI model DTOs.
 */

import type { AiClient } from "@shared/ai/aiClient";
import type { LineAnalysisEntry } from "@shared/models/ai/line";

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
  const responseText = await aiClient.complete(prompt);
  const parsedResponse = parseAiJsonObject(responseText);

  return normalizeLineAnalysisEntries(parsedResponse, context);
}

/**
 * Parses the JSON object from an AI response.
 *
 * @param value - Raw AI response text.
 * @returns Parsed JSON value.
 *
 * @example
 * const parsed = parseAiJsonObject('{"lines":[]}');
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
 * Normalizes unknown AI output into line analysis entries.
 *
 * @param value - Parsed AI response payload.
 * @param context - Optional validation context for returned line numbers.
 * @returns Line analysis entries sorted by line number.
 * @throws Error when the response shape or any line item is invalid.
 *
 * @example
 * const entries = normalizeLineAnalysisEntries({ lines: [] });
 */
function normalizeLineAnalysisEntries(
  value: unknown,
  context?: ExplainLineBatchServiceContext,
): LineAnalysisEntry[] {
  const record = toRecord(value);

  if (!Array.isArray(record.lines)) {
    throw new Error("Invalid line batch analysis response: lines must be an array.");
  }

  const requestedLineNumbers = new Set(context?.requestedLineNumbers ?? []);

  return record.lines
    .map((line, index) => normalizeLineAnalysisEntry(line, index, requestedLineNumbers))
    .sort((left, right) => left.lineNumber - right.lineNumber);
}

/**
 * Normalizes one unknown line item into a LineAnalysisEntry DTO.
 *
 * @param value - Unknown line payload.
 * @param index - Line array index used in validation errors.
 * @param requestedLineNumbers - Optional set of allowed line numbers.
 * @returns Validated line analysis entry.
 * @throws Error when required fields are missing or invalid.
 *
 * @example
 * const entry = normalizeLineAnalysisEntry(lineJson, 0, new Set([2]));
 */
function normalizeLineAnalysisEntry(
  value: unknown,
  index: number,
  requestedLineNumbers: ReadonlySet<number>,
): LineAnalysisEntry {
  const record = toRecord(value);
  const lineNumber = normalizeLineNumber(record.lineNumber);
  const summary = nonEmptyString(record.summary);
  const detail = nonEmptyString(record.detail);

  if (
    !lineNumber ||
    (requestedLineNumbers.size > 0 && !requestedLineNumbers.has(lineNumber)) ||
    !summary ||
    !detail
  ) {
    throw new Error(
      `Invalid line batch analysis response: line ${index} requires lineNumber, summary, and detail.`,
    );
  }

  const aiNotes = normalizeStringArray(record.aiNotes);
  const entry: LineAnalysisEntry = {
    lineNumber,
    summary,
    detail,
  };

  if (aiNotes.length > 0) {
    entry.aiNotes = aiNotes;
  }

  return entry;
}

/**
 * Converts an unknown value into a valid one-based source line number.
 *
 * @param value - Unknown line number value.
 * @returns Valid line number or undefined.
 *
 * @example
 * const line = normalizeLineNumber("3");
 */
function normalizeLineNumber(value: unknown): number | undefined {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 1) {
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
 * const record = toRecord({ lines: [] });
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
 * const summary = nonEmptyString("Returns JSX");
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
