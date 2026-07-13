/**
 * Detects whether stored source-file notes still match current source text.
 */

import type { LineRange } from "@shared/models/common";
import type { NoteStatus } from "@shared/models/domain/common";
import type { StoredLineNote } from "@shared/models/store/line";
import type { StoredSectionNote } from "@shared/models/store/section";
import type { ProgrammingLanguage, StoredSourceFile } from "@shared/models/store/sourceFile";
import { createSourceHash } from "@shared/utils/hashUtils";

/**
 * Reason describing the file-level source hash result.
 *
 * @example
 * const reason: SourceFileDetectionReason = "sourceHashChanged";
 */
export type SourceFileDetectionReason = "sourceHashMatched" | "sourceHashChanged";

/**
 * Optional current source metadata supplied by the caller.
 *
 * @example
 * const options: SourceFileNoteDetectionOptions = {
 *   programmingLanguage: "typescriptreact",
 * };
 */
export type SourceFileNoteDetectionOptions = {
  /**
   * Current VS Code TextDocument.languageId for the source file.
   *
   * When omitted, programming language changes are not checked.
   */
  programmingLanguage?: ProgrammingLanguage;
};

/**
 * Options for detecting notes affected by a source edit range.
 *
 * @example
 * const options: ChangedSourceRangeNoteDetectionOptions = {
 *   changedStartLine: 20,
 *   programmingLanguage: "typescript",
 * };
 */
export type ChangedSourceRangeNoteDetectionOptions = SourceFileNoteDetectionOptions & {
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
 * Reason describing one section anchor detection result.
 *
 * @example
 * const reason: SectionNoteDetectionReason = "anchorHashChanged";
 */
export type SectionNoteDetectionReason = "anchorHashMatched" | "anchorHashChanged" | "rangeOutOfBounds";

/**
 * Reason describing one line anchor detection result.
 *
 * @example
 * const reason: LineNoteDetectionReason = "anchorTextChanged";
 */
export type LineNoteDetectionReason = "anchorTextMatched" | "anchorTextChanged" | "lineOutOfBounds";

/**
 * File-level detection result for one stored source file.
 *
 * @example
 * const result: SourceFileDetectionResult = {
 *   sourceHashChanged: true,
 *   programmingLanguageChanged: false,
 *   status: { content: "stale", anchor: "confirmed" },
 *   reason: "sourceHashChanged",
 *   previousSourceHash: "sha256:old",
 *   currentSourceHash: "sha256:new",
 *   previousProgrammingLanguage: "typescript",
 *   currentProgrammingLanguage: "typescript",
 *   currentLineCount: 10,
 * };
 */
export type SourceFileDetectionResult = {
  /**
   * Suggested file-level status.
   *
   * File notes are attached to the whole source file, so anchor is always
   * confirmed here. Content becomes stale when the source hash changes.
   */
  status: NoteStatus;

  /** Whether current source text differs from the stored source hash. */
  sourceHashChanged: boolean;

  /** Whether current VS Code language id differs from the stored language id. */
  programmingLanguageChanged?: boolean;

  /** Machine-readable reason for the file-level result. */
  reason: SourceFileDetectionReason;

  /** Source hash stored with the source file notes. */
  previousSourceHash: string;

  /** Source hash computed from current source text. */
  currentSourceHash: string;

  /** VS Code language id stored with the source file notes. */
  previousProgrammingLanguage?: ProgrammingLanguage;

  /** Current VS Code language id supplied by the caller. */
  currentProgrammingLanguage?: ProgrammingLanguage;

  /** Current source line count used for range and line validation. */
  currentLineCount: number;
};

/**
 * Detection result for one stored section note.
 *
 * @example
 * const result: SectionNoteDetectionResult = {
 *   id: "section:intro:1-3",
 *   status: { content: "stale", anchor: "needsConfirmation" },
 *   reason: "anchorHashChanged",
 *   range: { startLine: 1, endLine: 3 },
 *   previousAnchorHash: "sha256:old",
 *   currentAnchorHash: "sha256:new",
 * };
 */
export type SectionNoteDetectionResult = {
  /** Stable section note id. */
  id: string;

  /** Suggested section note status implied by the current source text. */
  status: NoteStatus;

  /** Machine-readable reason for the section result. */
  reason: SectionNoteDetectionReason;

  /** Stored one-based inclusive section range. */
  range: LineRange;

  /** Section range hash stored with the note. */
  previousAnchorHash: string;

  /** Current section range hash when the stored range is valid. */
  currentAnchorHash?: string;
};

/**
 * Detection result for one stored line note.
 *
 * @example
 * const result: LineNoteDetectionResult = {
 *   id: "line:3",
 *   status: { content: "stale", anchor: "needsConfirmation" },
 *   reason: "anchorTextChanged",
 *   line: 3,
 *   previousAnchorText: "return oldValue;",
 *   currentAnchorText: "return newValue;",
 * };
 */
export type LineNoteDetectionResult = {
  /** Stable line note id. */
  id: string;

  /** Suggested line note status implied by the current source text. */
  status: NoteStatus;

  /** Machine-readable reason for the line result. */
  reason: LineNoteDetectionReason;

  /** Stored one-based source line number. */
  line: number;

  /** Source text stored with the line note anchor. */
  previousAnchorText: string;

  /** Current source text at the stored line when the line is valid. */
  currentAnchorText?: string;
};

/**
 * Complete detection report for all notes attached to one source file.
 *
 * @example
 * const report: SourceFileNoteDetectionReport = detectSourceFileNotes(sourceText, sourceFile);
 */
export type SourceFileNoteDetectionReport = {
  /** File-level source hash detection result. */
  file: SourceFileDetectionResult;

  /** Detection results for every stored section note. */
  sections: SectionNoteDetectionResult[];

  /** Detection results for every stored line note. */
  lines: LineNoteDetectionResult[];
};

/**
 * Detects whether stored notes still match current source text.
 *
 * This function is pure. It does not read files, write files, mutate note
 * status, or interact with VS Code.
 *
 * @param sourceText - Current full source text.
 * @param sourceFile - Stored source-file notes to check.
 * @returns Detection report for file, section, and line notes.
 *
 * @example
 * const report = detectSourceFileNotes("const value = 1;", sourceFile);
 */
export function detectSourceFileNotes(
  sourceText: string,
  sourceFile: StoredSourceFile,
  options: SourceFileNoteDetectionOptions = {},
): SourceFileNoteDetectionReport {
  const lines = splitSourceLines(sourceText);
  const currentSourceHash = createSourceHash(sourceText);
  const sectionAnchorHashCache = new Map<string, string>();
  const sourceHashChanged = sourceFile.source.sourceHash !== currentSourceHash;
  const programmingLanguageChanged = options.programmingLanguage === undefined
    ? undefined
    : sourceFile.source.programmingLanguage !== options.programmingLanguage;

  return {
    file: {
      status: {
        content: sourceHashChanged ? "stale" : "current",
        anchor: "confirmed",
      },
      sourceHashChanged,
      ...(programmingLanguageChanged === undefined ? {} : { programmingLanguageChanged }),
      reason: sourceHashChanged ? "sourceHashChanged" : "sourceHashMatched",
      previousSourceHash: sourceFile.source.sourceHash,
      currentSourceHash,
      ...(sourceFile.source.programmingLanguage
        ? { previousProgrammingLanguage: sourceFile.source.programmingLanguage }
        : {}),
      ...(options.programmingLanguage ? { currentProgrammingLanguage: options.programmingLanguage } : {}),
      currentLineCount: lines.length,
    },
    sections: sourceFile.sectionNotes.map((note) => detectSectionNote(lines, note, sectionAnchorHashCache)),
    lines: sourceFile.lineNotes.map((note) => detectLineNote(lines, note)),
  };
}

/**
 * Detects every note attached to one source file.
 *
 * This is a semantic wrapper around detectSourceFileNotes for callers that
 * explicitly want a full-file check.
 *
 * @param sourceText - Current full source text.
 * @param sourceFile - Stored source-file notes to check.
 * @param options - Optional current source metadata.
 * @returns Detection report for file and every stored section and line note.
 *
 * @example
 * const report = detectEntireSourceFileNotes(sourceText, sourceFile);
 */
export function detectEntireSourceFileNotes(
  sourceText: string,
  sourceFile: StoredSourceFile,
  options: SourceFileNoteDetectionOptions = {},
): SourceFileNoteDetectionReport {
  return detectSourceFileNotes(sourceText, sourceFile, options);
}

/**
 * Detects notes whose stored anchors are affected by a change starting at a line.
 *
 * File-level detection is always included. Section and line results are limited
 * to notes that may be affected by edits at or below changedStartLine.
 *
 * @param sourceText - Current full source text.
 * @param sourceFile - Stored source-file notes to check.
 * @param options - Changed range and optional current source metadata.
 * @returns Detection report for file and affected section and line notes.
 * @throws Error when changedStartLine is not a positive integer.
 *
 * @example
 * const report = detectChangedSourceRangeNotes(sourceText, sourceFile, { changedStartLine: 20 });
 */
export function detectChangedSourceRangeNotes(
  sourceText: string,
  sourceFile: StoredSourceFile,
  options: ChangedSourceRangeNoteDetectionOptions,
): SourceFileNoteDetectionReport {
  assertValidChangedStartLine(options.changedStartLine);

  return detectSourceFileNotes(
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

/**
 * Detects whether one section note range still points at the same source text.
 *
 * @param lines - Current source text split into lines.
 * @param note - Stored section note to check.
 * @returns Detection result for the section note.
 *
 * @example
 * const result = detectSectionNote(["const value = 1;"], sectionNote);
 */
function detectSectionNote(
  lines: string[],
  note: StoredSectionNote,
  anchorHashCache: Map<string, string>,
): SectionNoteDetectionResult {
  if (!isValidRangeForLines(note.range, lines.length)) {
    return {
      id: note.id,
      status: {
        content: "stale",
        anchor: "orphaned",
      },
      reason: "rangeOutOfBounds",
      range: note.range,
      previousAnchorHash: note.anchorHash,
    };
  }

  const currentAnchorHash = getRangeHash(lines, note.range, anchorHashCache);
  const anchorHashMatched = currentAnchorHash === note.anchorHash;

  return {
    id: note.id,
    status: {
      content: anchorHashMatched ? "current" : "stale",
      anchor: anchorHashMatched ? "confirmed" : "needsConfirmation",
    },
    reason: anchorHashMatched ? "anchorHashMatched" : "anchorHashChanged",
    range: note.range,
    previousAnchorHash: note.anchorHash,
    currentAnchorHash,
  };
}

/**
 * Returns the current hash for a section range, reusing repeated range checks.
 *
 * @param lines - Current source text split into lines.
 * @param range - One-based inclusive range to hash.
 * @param anchorHashCache - Per-detection range hash cache.
 * @returns Current hash for the requested range.
 *
 * @example
 * const hash = getRangeHash(["a", "b"], { startLine: 1, endLine: 2 }, new Map());
 */
function getRangeHash(lines: string[], range: LineRange, anchorHashCache: Map<string, string>): string {
  const cacheKey = `${range.startLine}:${range.endLine}`;
  const cachedHash = anchorHashCache.get(cacheKey);

  if (cachedHash) {
    return cachedHash;
  }

  const hash = createSourceHash(getRangeText(lines, range));

  anchorHashCache.set(cacheKey, hash);

  return hash;
}

/**
 * Detects whether one line note still points at the same source text.
 *
 * @param lines - Current source text split into lines.
 * @param note - Stored line note to check.
 * @returns Detection result for the line note.
 *
 * @example
 * const result = detectLineNote(["const value = 1;"], lineNote);
 */
function detectLineNote(lines: string[], note: StoredLineNote): LineNoteDetectionResult {
  if (!isValidLineForLines(note.line, lines.length)) {
    return {
      id: note.id,
      status: {
        content: "stale",
        anchor: "orphaned",
      },
      reason: "lineOutOfBounds",
      line: note.line,
      previousAnchorText: note.anchorText,
    };
  }

  const currentAnchorText = lines[note.line - 1] ?? "";
  const anchorTextMatched = currentAnchorText === note.anchorText;

  return {
    id: note.id,
    status: {
      content: anchorTextMatched ? "current" : "stale",
      anchor: anchorTextMatched ? "confirmed" : "needsConfirmation",
    },
    reason: anchorTextMatched ? "anchorTextMatched" : "anchorTextChanged",
    line: note.line,
    previousAnchorText: note.anchorText,
    currentAnchorText,
  };
}

/**
 * Splits source text into VS Code-like logical lines.
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

/**
 * Checks whether a one-based inclusive range fits within the current source.
 *
 * @param range - Range to validate.
 * @param lineCount - Current source line count.
 * @returns True when the range can be read from the current source.
 *
 * @example
 * const valid = isValidRangeForLines({ startLine: 1, endLine: 2 }, 3);
 */
function isValidRangeForLines(range: LineRange, lineCount: number): boolean {
  return (
    Number.isInteger(range.startLine) &&
    Number.isInteger(range.endLine) &&
    range.startLine >= 1 &&
    range.endLine >= range.startLine &&
    range.endLine <= lineCount
  );
}

/**
 * Checks whether a one-based line number fits within the current source.
 *
 * @param line - Line number to validate.
 * @param lineCount - Current source line count.
 * @returns True when the line can be read from the current source.
 *
 * @example
 * const valid = isValidLineForLines(1, 3);
 */
function isValidLineForLines(line: number, lineCount: number): boolean {
  return Number.isInteger(line) && line >= 1 && line <= lineCount;
}

/**
 * Validates the first line affected by a source change.
 *
 * @param changedStartLine - One-based first source line affected by a change.
 * @throws Error when changedStartLine is invalid.
 *
 * @example
 * assertValidChangedStartLine(20);
 */
function assertValidChangedStartLine(changedStartLine: number): void {
  if (!Number.isInteger(changedStartLine) || changedStartLine < 1) {
    throw new Error("Invalid changed source range: changedStartLine must be a positive integer.");
  }
}
