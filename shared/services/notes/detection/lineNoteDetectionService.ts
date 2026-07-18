/**
 * Detects line note anchors against current source text.
 */

import type { NoteStatus } from "@shared/models/domain/common";
import type { StoredLineNote } from "@shared/models/store/line";

/**
 * Reason describing one line detection result.
 *
 * @example
 * const reason: LineNoteDetectionReason = "anchorTextChanged";
 */
export type LineNoteDetectionReason =
  | "anchorTextMatched"
  | "anchorTextChanged"
  | "lineOutOfBounds";

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
 * Detects whether one line note still points at the same source text.
 *
 * @param sourceText - Current full source text.
 * @param note - Stored line note to check.
 * @returns Detection result for the line note.
 *
 * @example
 * const result = detectLineNote("const value = 1;", lineNote);
 */
export function detectLineNote(sourceText: string, note: StoredLineNote): LineNoteDetectionResult {
  return detectLineNoteFromLines(splitSourceLines(sourceText), note);
}

/**
 * Detects multiple line notes.
 *
 * @param sourceText - Current full source text.
 * @param notes - Stored line notes to check.
 * @returns Detection results for the supplied line notes.
 *
 * @example
 * const results = detectLineNotes("const value = 1;", lineNotes);
 */
export function detectLineNotes(
  sourceText: string,
  notes: StoredLineNote[],
): LineNoteDetectionResult[] {
  const lines = splitSourceLines(sourceText);

  return notes.map((note) => detectLineNoteFromLines(lines, note));
}

/**
 * Detects one line note from pre-split source lines.
 *
 * @param lines - Current source text split into lines.
 * @param note - Stored line note to check.
 * @returns Detection result for the line note.
 *
 * @example
 * const result = detectLineNoteFromLines(["const value = 1;"], lineNote);
 */
export function detectLineNoteFromLines(
  lines: string[],
  note: StoredLineNote,
): LineNoteDetectionResult {
  if (!isValidLineForLines(note.line, lines.length)) {
    return {
      id: note.id,
      status: {
        content: "stale",
        anchor: "needsConfirmation",
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

function splitSourceLines(sourceText: string): string[] {
  return sourceText.split(/\r\n|\r|\n/);
}

function isValidLineForLines(line: number, lineCount: number): boolean {
  return Number.isInteger(line) && line >= 1 && line <= lineCount;
}
