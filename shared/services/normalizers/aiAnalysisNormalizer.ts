/**
 * Normalizes untrusted AI JSON into the current file, section, and line DTOs.
 */

import type { AIExplanation } from "@shared/models/ai/common";
import type { FileAnalysis } from "@shared/models/ai/file";
import type { LineAnalysis, LineAnalysisEntry } from "@shared/models/ai/line";
import type { SectionAnalysis } from "@shared/models/ai/section";
import {
  nonEmptyString,
  normalizeLineNumber,
  normalizeLineRange,
  normalizeStringArray,
  toRecord,
} from "./aiResponseNormalizer";

/**
 * Optional error context for one explanation-shaped DTO.
 */
export type ExplanationNormalizationOptions = {
  /** Human-readable response name used in validation errors. */
  responseName?: string;

  /** Optional JSON field prefix such as file. */
  fieldName?: string;
};

/**
 * Options for section-list normalization.
 */
export type SectionAnalysisNormalizationOptions = {
  /** Human-readable response name used in validation errors. */
  responseName?: string;

  /** Optional current source line count used to validate ranges. */
  lineCount?: number;
};

/**
 * Options for batch line-analysis normalization.
 */
export type LineAnalysisEntriesNormalizationOptions = {
  /** Human-readable response name used in validation errors. */
  responseName?: string;

  /** Exact line numbers requested from the AI, when available. */
  requestedLineNumbers?: readonly number[];
};

/**
 * Normalizes one file-level AI explanation.
 *
 * @param value - Unknown parsed file analysis.
 * @param options - Optional response and field names for validation errors.
 * @returns Validated FileAnalysis DTO.
 *
 * @example
 * const file = normalizeFileAnalysis({ summary: "Loads settings", detail: "Reads configuration." });
 */
export function normalizeFileAnalysis(
  value: unknown,
  options?: ExplanationNormalizationOptions,
): FileAnalysis {
  return normalizeExplanation(value, options?.responseName ?? "file analysis", options?.fieldName);
}

/**
 * Normalizes one line-level AI explanation.
 *
 * @param value - Unknown parsed line analysis.
 * @param options - Optional response and field names for validation errors.
 * @returns Validated LineAnalysis DTO.
 *
 * @example
 * const line = normalizeLineAnalysis({ summary: "Returns a value", detail: "Returns the result." });
 */
export function normalizeLineAnalysis(
  value: unknown,
  options?: ExplanationNormalizationOptions,
): LineAnalysis {
  return normalizeExplanation(value, options?.responseName ?? "line analysis", options?.fieldName);
}

/**
 * Normalizes an unknown section array and sorts it by starting line.
 *
 * @param value - Unknown sections array.
 * @param options - Optional source range and error context.
 * @returns Validated SectionAnalysis DTOs sorted by startLine.
 *
 * @example
 * const sections = normalizeSectionAnalyses([], { lineCount: 20 });
 */
export function normalizeSectionAnalyses(
  value: unknown,
  options?: SectionAnalysisNormalizationOptions,
): SectionAnalysis[] {
  const responseName = options?.responseName ?? "section analysis";

  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${responseName} response: sections must be an array.`);
  }

  return value
    .map((section, index) => normalizeSectionAnalysis(section, index, responseName, options?.lineCount))
    .sort((left, right) => left.range.startLine - right.range.startLine);
}

/**
 * Normalizes an unknown batch line array and validates exact requested coverage.
 *
 * @param value - Unknown lines array.
 * @param options - Optional requested line numbers and error context.
 * @returns Validated entries sorted by lineNumber.
 *
 * @example
 * const lines = normalizeLineAnalysisEntries([], { requestedLineNumbers: [] });
 */
export function normalizeLineAnalysisEntries(
  value: unknown,
  options?: LineAnalysisEntriesNormalizationOptions,
): LineAnalysisEntry[] {
  const responseName = options?.responseName ?? "line batch analysis";

  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${responseName} response: lines must be an array.`);
  }

  const requestedLineNumbers = new Set(options?.requestedLineNumbers ?? []);
  const entries = value.map((line, index) =>
    normalizeLineAnalysisEntry(line, index, requestedLineNumbers, responseName),
  );

  assertUniqueLineNumbers(entries, responseName);

  if (options?.requestedLineNumbers !== undefined) {
    assertCompleteRequestedLineNumbers(entries, requestedLineNumbers, responseName);
  }

  return entries.sort((left, right) => left.lineNumber - right.lineNumber);
}

/** Normalizes the shared summary, detail, and aiNotes fields. */
function normalizeExplanation(
  value: unknown,
  responseName: string,
  fieldName?: string,
): AIExplanation {
  const record = toRecord(value);
  const summary = nonEmptyString(record.summary);
  const detail = nonEmptyString(record.detail);
  const fieldPrefix = fieldName ? `${fieldName}.` : "";

  if (!summary || !detail) {
    throw new Error(
      `Invalid ${responseName} response: ${fieldPrefix}summary and ${fieldPrefix}detail are required.`,
    );
  }

  const aiNotes = normalizeStringArray(record.aiNotes);
  const analysis: AIExplanation = { summary, detail };

  if (aiNotes.length > 0) {
    analysis.aiNotes = aiNotes;
  }

  return analysis;
}

/** Normalizes one section entry with its source range. */
function normalizeSectionAnalysis(
  value: unknown,
  index: number,
  responseName: string,
  lineCount?: number,
): SectionAnalysis {
  const record = toRecord(value);
  const title = nonEmptyString(record.title);
  const summary = nonEmptyString(record.summary);
  const detail = nonEmptyString(record.detail);
  const range = normalizeLineRange(record.range, lineCount);

  if (!title || !summary || !detail || !range) {
    throw new Error(
      `Invalid ${responseName} response: section ${index} requires title, range, summary, and detail.`,
    );
  }

  const section: SectionAnalysis = { title, range, summary, detail };
  const kind = nonEmptyString(record.kind);
  const aiNotes = normalizeStringArray(record.aiNotes);

  if (kind) {
    section.kind = kind;
  }

  if (aiNotes.length > 0) {
    section.aiNotes = aiNotes;
  }

  return section;
}

/** Normalizes one batch line entry and validates its requested line number. */
function normalizeLineAnalysisEntry(
  value: unknown,
  index: number,
  requestedLineNumbers: ReadonlySet<number>,
  responseName: string,
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
      `Invalid ${responseName} response: line ${index} requires lineNumber, summary, and detail.`,
    );
  }

  const entry: LineAnalysisEntry = { lineNumber, summary, detail };
  const aiNotes = normalizeStringArray(record.aiNotes);

  if (aiNotes.length > 0) {
    entry.aiNotes = aiNotes;
  }

  return entry;
}

/** Rejects duplicate line numbers in one batch response. */
function assertUniqueLineNumbers(entries: readonly LineAnalysisEntry[], responseName: string): void {
  const lineNumbers = new Set<number>();

  for (const entry of entries) {
    if (lineNumbers.has(entry.lineNumber)) {
      throw new Error(`Invalid ${responseName} response: duplicate lineNumber ${entry.lineNumber}.`);
    }

    lineNumbers.add(entry.lineNumber);
  }
}

/** Ensures every explicitly requested line has exactly one result. */
function assertCompleteRequestedLineNumbers(
  entries: readonly LineAnalysisEntry[],
  requestedLineNumbers: ReadonlySet<number>,
  responseName: string,
): void {
  const returnedLineNumbers = new Set(entries.map((entry) => entry.lineNumber));
  const missingLineNumbers = [...requestedLineNumbers].filter(
    (lineNumber) => !returnedLineNumbers.has(lineNumber),
  );

  if (missingLineNumbers.length > 0 || returnedLineNumbers.size !== requestedLineNumbers.size) {
    throw new Error(
      `Invalid ${responseName} response: expected exactly one result for requested lineNumbers ${[
        ...requestedLineNumbers,
      ].join(", ")}.`,
    );
  }
}
