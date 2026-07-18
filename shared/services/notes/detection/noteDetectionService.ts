/**
 * Combines file, section, and line note detection for one stored file group.
 */

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  detectFileNote,
  type FileNoteDetectionOptions,
  type FileNoteDetectionResult,
} from "./fileNoteDetectionService";
import {
  detectLineNoteFromLines,
  type LineNoteDetectionResult,
} from "./lineNoteDetectionService";
import {
  detectSectionNoteFromLines,
  type SectionNoteDetectionResult,
} from "./sectionNoteDetectionService";

/**
 * Options for detecting notes affected by a source edit.
 *
 * @example
 * const options: AffectedFileNotesDetectionOptions = {
 *   changedStartLine: 20,
 *   programmingLanguage: "typescript",
 * };
 */
export type AffectedFileNotesDetectionOptions = FileNoteDetectionOptions & {
  /**
   * One-based first source line affected by a source change.
   *
   * File-level detection is always performed. Section notes are checked when
   * their stored range ends at or after this line. Line notes are checked when
   * their stored line is at or after this line.
   */
  changedStartLine: number;
};

/**
 * Complete detection report for all notes attached to one file.
 *
 * @example
 * const report: FileNotesDetectionReport = detectFileNotes(sourceText, sourceFile);
 */
export type FileNotesDetectionReport = {
  /** File-level source hash detection result. */
  file: FileNoteDetectionResult;

  /** Detection results for every checked section note. */
  sections: SectionNoteDetectionResult[];

  /** Detection results for every checked line note. */
  lines: LineNoteDetectionResult[];
};

/**
 * Detects whether stored notes still match current source text.
 *
 * This function is pure. It does not read files, write files, mutate note
 * status, or interact with VS Code.
 *
 * @param sourceText - Current full source text.
 * @param sourceFile - Stored file notes to check.
 * @param options - Optional current source metadata.
 * @returns Detection report for file, section, and line notes.
 *
 * @example
 * const report = detectFileNotes("const value = 1;", sourceFile);
 */
export function detectFileNotes(
  sourceText: string,
  sourceFile: StoredSourceFile,
  options: FileNoteDetectionOptions = {},
): FileNotesDetectionReport {
  const lines = splitSourceLines(sourceText);
  const sectionAnchorHashCache = new Map<string, string>();

  return {
    file: detectFileNote(sourceText, sourceFile, options),
    sections: sourceFile.sectionNotes.map((note) =>
      detectSectionNoteFromLines(lines, note, sectionAnchorHashCache),
    ),
    lines: sourceFile.lineNotes.map((note) => detectLineNoteFromLines(lines, note)),
  };
}

/**
 * Detects notes whose stored anchors may be affected by a change starting at a line.
 *
 * File-level detection is always included. Section and line results are limited
 * to notes that may be affected by edits at or below changedStartLine.
 *
 * @param sourceText - Current full source text.
 * @param sourceFile - Stored file notes to check.
 * @param options - Changed line and optional current source metadata.
 * @returns Detection report for file and affected section and line notes.
 * @throws Error when changedStartLine is not a positive integer.
 *
 * @example
 * const report = detectAffectedFileNotes(sourceText, sourceFile, { changedStartLine: 20 });
 */
export function detectAffectedFileNotes(
  sourceText: string,
  sourceFile: StoredSourceFile,
  options: AffectedFileNotesDetectionOptions,
): FileNotesDetectionReport {
  assertValidChangedStartLine(options.changedStartLine);

  return detectFileNotes(
    sourceText,
    {
      ...sourceFile,
      sectionNotes: sourceFile.sectionNotes.filter((note) =>
        note.range.endLine >= options.changedStartLine,
      ),
      lineNotes: sourceFile.lineNotes.filter((note) =>
        note.line >= options.changedStartLine,
      ),
    },
    options,
  );
}

function splitSourceLines(sourceText: string): string[] {
  return sourceText.split(/\r\n|\r|\n/);
}

function assertValidChangedStartLine(changedStartLine: number): void {
  if (!Number.isInteger(changedStartLine) || changedStartLine < 1) {
    throw new Error("Invalid changed source range: changedStartLine must be a positive integer.");
  }
}
