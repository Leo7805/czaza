/**
 * Confirms current source anchors as the new baseline for stored notes.
 */

import type { LineRange } from "@shared/models/common";
import type { ProgrammingLanguage, StoredSourceFile } from "@shared/models/store/sourceFile";
import { assertValidLine, assertValidRange } from "@shared/services/notes/noteAnchorService";
import { createSourceHash } from "@shared/utils/hashUtils";

const confirmedStatus = {
  content: "current",
  anchor: "confirmed",
} as const;

/**
 * Confirms the current full source text as the file-level baseline.
 *
 * This updates sourceHash, optional programmingLanguage, file note status, and
 * file note updatedAt when a file note exists.
 *
 * @param sourceFile - Stored source file to update.
 * @param sourceText - Current full source text.
 * @param programmingLanguage - Current VS Code TextDocument.languageId, when available.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = confirmFileSource(sourceFile, sourceText, "typescript", now);
 */
export function confirmFileSource(
  sourceFile: StoredSourceFile,
  sourceText: string,
  programmingLanguage: ProgrammingLanguage | undefined,
  now: string,
): StoredSourceFile {
  return {
    ...sourceFile,
    source: {
      ...sourceFile.source,
      sourceHash: createSourceHash(sourceText),
      ...(programmingLanguage ? { programmingLanguage } : {}),
    },
    ...(sourceFile.fileNote
      ? {
          fileNote: {
            ...sourceFile.fileNote,
            status: confirmedStatus,
            updatedAt: now,
          },
        }
      : {}),
  };
}

/**
 * Confirms one section note against its currently stored range.
 *
 * @param sourceFile - Stored source file to update.
 * @param sectionId - Stable section note id.
 * @param sourceText - Current full source text.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = confirmSectionCurrentRange(sourceFile, "section:1", sourceText, now);
 */
export function confirmSectionCurrentRange(
  sourceFile: StoredSourceFile,
  sectionId: string,
  sourceText: string,
  now: string,
): StoredSourceFile {
  const note = sourceFile.sectionNotes.find((section) => section.id === sectionId);

  if (!note) {
    return sourceFile;
  }

  return confirmSectionRange(sourceFile, sectionId, note.range, sourceText, now);
}

/**
 * Confirms one section note against a new source range.
 *
 * This updates range, anchorHash, status, and updatedAt in one operation.
 *
 * @param sourceFile - Stored source file to update.
 * @param sectionId - Stable section note id.
 * @param range - One-based inclusive range to confirm.
 * @param sourceText - Current full source text.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 * @throws Error when range is invalid for the current source text.
 *
 * @example
 * const next = confirmSectionRange(sourceFile, "section:1", { startLine: 2, endLine: 4 }, sourceText, now);
 */
export function confirmSectionRange(
  sourceFile: StoredSourceFile,
  sectionId: string,
  range: LineRange,
  sourceText: string,
  now: string,
): StoredSourceFile {
  const lines = splitSourceLines(sourceText);

  assertValidRange(range, lines.length);

  const anchorHash = createSourceHash(getRangeText(lines, range));

  return {
    ...sourceFile,
    sectionNotes: sourceFile.sectionNotes.map((note) =>
      note.id === sectionId
        ? {
            ...note,
            range,
            anchorHash,
            status: confirmedStatus,
            updatedAt: now,
          }
        : note,
    ),
  };
}

/**
 * Confirms one line note against its currently stored line number.
 *
 * @param sourceFile - Stored source file to update.
 * @param lineId - Stable line note id.
 * @param sourceText - Current full source text.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = confirmLineCurrentText(sourceFile, "line:1", sourceText, now);
 */
export function confirmLineCurrentText(
  sourceFile: StoredSourceFile,
  lineId: string,
  sourceText: string,
  now: string,
): StoredSourceFile {
  const note = sourceFile.lineNotes.find((line) => line.id === lineId);

  if (!note) {
    return sourceFile;
  }

  return confirmLineNumber(sourceFile, lineId, note.line, sourceText, now);
}

/**
 * Confirms one line note against a new source line number.
 *
 * This updates line, anchorText, status, and updatedAt in one operation.
 *
 * @param sourceFile - Stored source file to update.
 * @param lineId - Stable line note id.
 * @param line - One-based source line number to confirm.
 * @param sourceText - Current full source text.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file with line notes sorted by line number.
 * @throws Error when line is invalid for the current source text.
 *
 * @example
 * const next = confirmLineNumber(sourceFile, "line:1", 4, sourceText, now);
 */
export function confirmLineNumber(
  sourceFile: StoredSourceFile,
  lineId: string,
  line: number,
  sourceText: string,
  now: string,
): StoredSourceFile {
  const lines = splitSourceLines(sourceText);

  assertValidLine(line, lines.length);

  return {
    ...sourceFile,
    lineNotes: sourceFile.lineNotes
      .map((note) =>
        note.id === lineId
          ? {
              ...note,
              line,
              anchorText: lines[line - 1] ?? "",
              status: confirmedStatus,
              updatedAt: now,
            }
          : note,
      )
      .sort((left, right) => left.line - right.line || left.id.localeCompare(right.id)),
  };
}

/**
 * Splits source text into logical lines.
 *
 * @param sourceText - Current full source text.
 * @returns Source text split on LF, CRLF, or CR line endings.
 *
 * @example
 * const lines = splitSourceLines("a\\nb");
 */
function splitSourceLines(sourceText: string): string[] {
  return sourceText.split(/\r\n|\r|\n/);
}

/**
 * Reads the source text covered by a one-based inclusive range.
 *
 * @param lines - Current source text split into lines.
 * @param range - One-based inclusive range to extract.
 * @returns Source text for the range using LF line endings.
 *
 * @example
 * const text = getRangeText(["a", "b"], { startLine: 1, endLine: 2 });
 */
function getRangeText(lines: string[], range: LineRange): string {
  return lines.slice(range.startLine - 1, range.endLine).join("\n");
}
