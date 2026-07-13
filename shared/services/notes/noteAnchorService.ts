/**
 * Provides immutable anchor and source metadata updates for stored notes.
 */

import type { LineRange } from "@shared/models/common";
import type { StoredLineNote } from "@shared/models/store/line";
import type { ProgrammingLanguage, StoredSourceFile } from "@shared/models/store/sourceFile";

/**
 * Updates the stored source hash for one source file.
 *
 * @param sourceFile - Stored source file to update.
 * @param sourceHash - Current source content hash.
 * @returns Updated stored source file.
 *
 * @example
 * const next = updateSourceHash(sourceFile, "sha256:abc123");
 */
export function updateSourceHash(sourceFile: StoredSourceFile, sourceHash: string): StoredSourceFile {
  return {
    ...sourceFile,
    source: {
      ...sourceFile.source,
      sourceHash,
    },
  };
}

/**
 * Updates the stored VS Code language id for one source file.
 *
 * @param sourceFile - Stored source file to update.
 * @param programmingLanguage - VS Code TextDocument.languageId, when available.
 * @returns Updated stored source file.
 *
 * @example
 * const next = updateProgrammingLanguage(sourceFile, "typescriptreact");
 */
export function updateProgrammingLanguage(
  sourceFile: StoredSourceFile,
  programmingLanguage: ProgrammingLanguage | undefined,
): StoredSourceFile {
  return {
    ...sourceFile,
    source: {
      ...sourceFile.source,
      ...(programmingLanguage ? { programmingLanguage } : {}),
    },
  };
}

/**
 * Updates one section note range after validating it against the source line count.
 *
 * @param sourceFile - Stored source file to update.
 * @param sectionId - Stable section note id.
 * @param range - Next one-based inclusive source range.
 * @param lineCount - Current source file line count.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = updateSectionRange(sourceFile, "section:1:intro:1-3", { startLine: 2, endLine: 4 }, 10, now);
 */
export function updateSectionRange(
  sourceFile: StoredSourceFile,
  sectionId: string,
  range: LineRange,
  lineCount: number,
  now: string,
): StoredSourceFile {
  assertValidRange(range, lineCount);

  return {
    ...sourceFile,
    sectionNotes: sourceFile.sectionNotes.map((note) =>
      note.id === sectionId
        ? {
            ...note,
            range,
            updatedAt: now,
          }
        : note,
    ),
  };
}

/**
 * Updates one section note anchor hash.
 *
 * @param sourceFile - Stored source file to update.
 * @param sectionId - Stable section note id.
 * @param anchorHash - Current hash for the section source range.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = updateSectionAnchorHash(sourceFile, "section:1:intro:1-3", "sha256:abc123", now);
 */
export function updateSectionAnchorHash(
  sourceFile: StoredSourceFile,
  sectionId: string,
  anchorHash: string,
  now: string,
): StoredSourceFile {
  return {
    ...sourceFile,
    sectionNotes: sourceFile.sectionNotes.map((note) =>
      note.id === sectionId
        ? {
            ...note,
            anchorHash,
            updatedAt: now,
          }
        : note,
    ),
  };
}

/**
 * Updates one line note number after validating it against the source line count.
 *
 * @param sourceFile - Stored source file to update.
 * @param lineId - Stable line note id.
 * @param line - Next one-based line number.
 * @param lineCount - Current source file line count.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file with line notes sorted by line number.
 *
 * @example
 * const next = updateLineNumber(sourceFile, "line:1", 3, 20, now);
 */
export function updateLineNumber(
  sourceFile: StoredSourceFile,
  lineId: string,
  line: number,
  lineCount: number,
  now: string,
): StoredSourceFile {
  assertValidLine(line, lineCount);

  return {
    ...sourceFile,
    lineNotes: sourceFile.lineNotes
      .map((note) =>
        note.id === lineId
          ? {
              ...note,
              line,
              updatedAt: now,
            }
          : note,
      )
      .sort(compareLineNotes),
  };
}

/**
 * Updates one line note anchor text.
 *
 * @param sourceFile - Stored source file to update.
 * @param lineId - Stable line note id.
 * @param anchorText - Current source text for the line anchor.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = updateLineAnchorText(sourceFile, "line:1", "const value = 1;", now);
 */
export function updateLineAnchorText(
  sourceFile: StoredSourceFile,
  lineId: string,
  anchorText: string,
  now: string,
): StoredSourceFile {
  return {
    ...sourceFile,
    lineNotes: sourceFile.lineNotes.map((note) =>
      note.id === lineId
        ? {
            ...note,
            anchorText,
            updatedAt: now,
          }
        : note,
    ),
  };
}

/**
 * Validates a one-based inclusive line range.
 *
 * @param range - Range to validate.
 * @param lineCount - Current source file line count.
 * @throws Error when the range is invalid.
 *
 * @example
 * assertValidRange({ startLine: 1, endLine: 3 }, 10);
 */
export function assertValidRange(range: LineRange, lineCount: number): void {
  assertValidLineCount(lineCount);

  if (!Number.isInteger(range.startLine) || range.startLine < 1) {
    throw new Error("Invalid section range: startLine must be a positive integer.");
  }

  if (!Number.isInteger(range.endLine) || range.endLine < range.startLine) {
    throw new Error("Invalid section range: endLine must be greater than or equal to startLine.");
  }

  if (range.endLine > lineCount) {
    throw new Error("Invalid section range: endLine exceeds source line count.");
  }
}

/**
 * Validates a one-based line number.
 *
 * @param line - Line number to validate.
 * @param lineCount - Current source file line count.
 * @throws Error when the line number is invalid.
 *
 * @example
 * assertValidLine(3, 10);
 */
export function assertValidLine(line: number, lineCount: number): void {
  assertValidLineCount(lineCount);

  if (!Number.isInteger(line) || line < 1) {
    throw new Error("Invalid line anchor: line must be a positive integer.");
  }

  if (line > lineCount) {
    throw new Error("Invalid line anchor: line exceeds source line count.");
  }
}

/**
 * Validates the current source file line count.
 *
 * @param lineCount - Current source file line count.
 * @throws Error when the line count is invalid.
 *
 * @example
 * assertValidLineCount(10);
 */
function assertValidLineCount(lineCount: number): void {
  if (!Number.isInteger(lineCount) || lineCount < 1) {
    throw new Error("Invalid source line count: lineCount must be a positive integer.");
  }
}

/**
 * Sorts line notes by source line for stable JSON output.
 *
 * @param left - First line note.
 * @param right - Second line note.
 * @returns Negative, zero, or positive sort value.
 *
 * @example
 * const sorted = [...lineNotes].sort(compareLineNotes);
 */
function compareLineNotes(left: StoredLineNote, right: StoredLineNote): number {
  return left.line - right.line || left.id.localeCompare(right.id);
}
