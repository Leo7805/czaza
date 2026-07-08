import { getLanguageFromFilePath } from "@shared/parser/language";
import type { ExplanationBlock, Language, Range } from "@shared/types/common";

export function parseAiJson(value: string): unknown {
  return JSON.parse(extractJsonText(value)) as unknown;
}

export function extractJsonText(value: string): string {
  const trimmed = value.trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return unfenced;
  }

  return unfenced.slice(firstBrace, lastBrace + 1);
}

export function normalizeExplanationBlock(value: unknown): ExplanationBlock {
  const record = asRecord(value);

  return {
    summary: typeof record.summary === "string" ? record.summary : "",
    detail: typeof record.detail === "string" ? record.detail : "",
    aiNotes: normalizeStringArray(record.aiNotes),
    userNotes: [],
  };
}

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

export function normalizeLineNumber(value: unknown, lineCount: number): number | undefined {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 1 || numberValue > lineCount) {
    return undefined;
  }

  return numberValue;
}

export function inferLanguage(filePath: string | undefined): Language {
  return (filePath ? getLanguageFromFilePath(filePath) : undefined) ?? "tsx";
}

export function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
