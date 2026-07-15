/**
 * Provides reusable primitives for parsing and narrowing untrusted AI JSON.
 */

import type { LineRange } from "@shared/models/common";

/**
 * Parses the JSON object contained in an AI response.
 *
 * @param value - Raw AI response that may include a fenced JSON block or surrounding text.
 * @returns Parsed JSON value, intentionally typed as unknown.
 *
 * @example
 * const parsed = parseAiJsonObject('```json\n{"file":{}}\n```');
 */
export function parseAiJsonObject(value: string): unknown {
  return JSON.parse(extractJsonObjectText(value)) as unknown;
}

/**
 * Extracts the most likely JSON object text from a raw AI response.
 *
 * @param value - Raw AI response text.
 * @returns Cleaned object text, or cleaned original text when no object boundary exists.
 *
 * @example
 * const json = extractJsonObjectText("Result: {\"ok\":true}");
 */
export function extractJsonObjectText(value: string): string {
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
 * Narrows an unknown object-like value for defensive field access.
 *
 * @param value - Unknown parsed JSON value.
 * @returns Object record or an empty record for non-object values.
 *
 * @example
 * const record = toRecord({ sections: [] });
 */
export function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Returns a string only when it contains non-whitespace content.
 *
 * @param value - Unknown AI field value.
 * @returns Original non-empty string or undefined.
 *
 * @example
 * const summary = nonEmptyString("Reads configuration");
 */
export function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/**
 * Keeps only string items from an unknown array value.
 *
 * @param value - Unknown AI field value.
 * @returns Array containing only string entries.
 *
 * @example
 * const notes = normalizeStringArray(["Useful", 1, null]);
 */
export function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Converts an unknown value into a valid one-based source line number.
 *
 * @param value - Unknown line-number value.
 * @param lineCount - Optional maximum source line number.
 * @returns Valid line number or undefined.
 *
 * @example
 * const line = normalizeLineNumber("12", 100);
 */
export function normalizeLineNumber(value: unknown, lineCount?: number): number | undefined {
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
 * Normalizes an unknown one-based inclusive source range.
 *
 * @param value - Unknown range-like value.
 * @param lineCount - Optional maximum source line number.
 * @returns Valid non-reversed range or undefined.
 *
 * @example
 * const range = normalizeLineRange({ startLine: 2, endLine: 8 }, 20);
 */
export function normalizeLineRange(value: unknown, lineCount?: number): LineRange | undefined {
  const record = toRecord(value);
  const startLine = normalizeLineNumber(record.startLine, lineCount);
  const endLine = normalizeLineNumber(record.endLine, lineCount);

  if (!startLine || !endLine || startLine > endLine) {
    return undefined;
  }

  return { startLine, endLine };
}
