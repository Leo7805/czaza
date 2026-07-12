/**
 * Provides single-line AI analysis using the new AI model DTOs.
 */

import type { AiClient } from "@shared/ai/aiClient";
import type { LineAnalysis } from "@shared/models/ai/line";

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

/**
 * Parses the JSON object from an AI response.
 *
 * @param value - Raw AI response text.
 * @returns Parsed JSON value.
 *
 * @example
 * const parsed = parseAiJsonObject('{"summary":"...","detail":"..."}');
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
 * Normalizes unknown AI output into the LineAnalysis DTO.
 *
 * @param value - Parsed AI response payload.
 * @returns LineAnalysis with validated required fields.
 * @throws Error when summary or detail is missing or empty.
 *
 * @example
 * const analysis = normalizeLineAnalysis({ summary: "Returns JSX", detail: "..." });
 */
function normalizeLineAnalysis(value: unknown): LineAnalysis {
  const record = toRecord(value);
  const summary = nonEmptyString(record.summary);
  const detail = nonEmptyString(record.detail);

  if (!summary || !detail) {
    throw new Error("Invalid line analysis response: summary and detail are required.");
  }

  const aiNotes = normalizeStringArray(record.aiNotes);
  const analysis: LineAnalysis = {
    summary,
    detail,
  };

  if (aiNotes.length > 0) {
    analysis.aiNotes = aiNotes;
  }

  return analysis;
}

/**
 * Narrows an unknown value into a record for defensive field reads.
 *
 * @param value - Unknown parsed value.
 * @returns Object record or an empty object for non-object values.
 *
 * @example
 * const record = toRecord({ summary: "..." });
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
