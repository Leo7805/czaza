import { getLanguageFromFilePath } from "@shared/parser/language";
import type { ExplanationBlock, Language, Range } from "@shared/types/common";

/**
 * Shared helpers used by AI explanation services.
 *
 * AI providers return plain text and untrusted JSON-like data. These utilities
 * keep that boundary narrow by extracting JSON, coercing unknown values into
 * safe internal shapes, and applying conservative defaults when optional fields
 * are missing or malformed.
 */

/**
 * Parses an AI response as JSON after removing common response wrappers.
 *
 * The return type is intentionally unknown because every service should
 * normalize the parsed payload into the specific DTO it expects.
 */
export function parseAiJson(value: string): unknown {
  return JSON.parse(extractJsonText(value)) as unknown;
}

/**
 * Extracts the most likely JSON object text from an AI response.
 *
 * This accepts ideal JSON, fenced ```json blocks, and responses with extra
 * prose around the JSON object. If no object boundary is found, the cleaned
 * text is returned so JSON.parse can surface the original parse error.
 */
export function extractJsonText(value: string): string {
  const trimmed = value.trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");

  // Preserve non-object responses for JSON.parse instead of hiding bad output.
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return unfenced;
  }

  return unfenced.slice(firstBrace, lastBrace + 1);
}

/**
 * Normalizes an AI explanation block into the legacy internal ExplanationBlock.
 *
 * Missing string fields become empty strings, invalid note arrays become [],
 * and userNotes always starts empty because user-authored notes are not AI
 * output and must be merged by the caller.
 */
export function normalizeExplanationBlock(value: unknown): ExplanationBlock {
  const record = asRecord(value);

  return {
    summary: typeof record.summary === "string" ? record.summary : "",
    detail: typeof record.detail === "string" ? record.detail : "",
    aiNotes: normalizeStringArray(record.aiNotes),
    userNotes: [],
  };
}

/**
 * Normalizes an unknown range-like value into a valid source range.
 *
 * Both endpoints must be valid one-based line numbers within the file. Reversed
 * ranges are accepted and reordered so callers do not need to duplicate that
 * defensive handling.
 */
export function normalizeRange(value: unknown, lineCount: number): Range | undefined {
  const record = asRecord(value);
  const startLine = normalizeLineNumber(record.startLine, lineCount);
  const endLine = normalizeLineNumber(record.endLine, lineCount);

  if (!startLine || !endLine) {
    return undefined;
  }

  return {
    startLine: Math.min(startLine, endLine),
    endLine: Math.max(startLine, endLine),
  };
}

/**
 * Converts an unknown value into a valid one-based source line number.
 *
 * Stringified numbers are accepted because AI JSON sometimes serializes numeric
 * fields as strings. Non-integers and out-of-file values are rejected.
 */
export function normalizeLineNumber(value: unknown, lineCount: number): number | undefined {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 1 || numberValue > lineCount) {
    return undefined;
  }

  return numberValue;
}

/**
 * Infers the supported language from a file path.
 *
 * TSX is the default fallback because the current extension primarily targets
 * TypeScript/React code when no reliable extension is available.
 */
export function inferLanguage(filePath: string | undefined): Language {
  return (filePath ? getLanguageFromFilePath(filePath) : undefined) ?? "tsx";
}

/**
 * Keeps only string items from an unknown array-like AI field.
 */
export function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Returns a string only when it contains non-whitespace content.
 *
 * The original string is preserved so callers can decide whether trimming would
 * be appropriate for display or persistence.
 */
export function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/**
 * Treats object-like unknown values as a record for defensive field access.
 *
 * Non-object values become an empty record, which lets normalizers read fields
 * without throwing when AI output is missing or structurally wrong.
 */
export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Converts display text into a stable lowercase identifier fragment.
 *
 * This is intentionally ASCII-only because generated ids are used internally
 * and should stay predictable across files, prompts, and storage.
 */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
