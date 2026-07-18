/**
 * Detects section note anchors against current source text.
 */

import type { LineRange } from "@shared/models/common";
import type { NoteStatus } from "@shared/models/domain/common";
import type { StoredSectionNote } from "@shared/models/store/section";
import { createSourceHash } from "@shared/utils/hashUtils";

/**
 * Reason describing one section detection result.
 *
 * @example
 * const reason: SectionNoteDetectionReason = "anchorHashChanged";
 */
export type SectionNoteDetectionReason =
  | "anchorHashMatched"
  | "anchorHashChanged"
  | "rangeOutOfBounds";

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
 * Detects whether one section note still points at the same source text.
 *
 * @param sourceText - Current full source text.
 * @param note - Stored section note to check.
 * @returns Detection result for the section note.
 *
 * @example
 * const result = detectSectionNote("const value = 1;", sectionNote);
 */
export function detectSectionNote(
  sourceText: string,
  note: StoredSectionNote,
): SectionNoteDetectionResult {
  return detectSectionNoteFromLines(splitSourceLines(sourceText), note, new Map());
}

/**
 * Detects multiple section notes, reusing range hashes during one pass.
 *
 * @param sourceText - Current full source text.
 * @param notes - Stored section notes to check.
 * @returns Detection results for the supplied section notes.
 *
 * @example
 * const results = detectSectionNotes("const value = 1;", sectionNotes);
 */
export function detectSectionNotes(
  sourceText: string,
  notes: StoredSectionNote[],
): SectionNoteDetectionResult[] {
  const lines = splitSourceLines(sourceText);
  const anchorHashCache = new Map<string, string>();

  return notes.map((note) => detectSectionNoteFromLines(lines, note, anchorHashCache));
}

/**
 * Detects one section note from pre-split source lines.
 *
 * @param lines - Current source text split into lines.
 * @param note - Stored section note to check.
 * @param anchorHashCache - Per-detection range hash cache.
 * @returns Detection result for the section note.
 *
 * @example
 * const result = detectSectionNoteFromLines(["const value = 1;"], sectionNote, new Map());
 */
export function detectSectionNoteFromLines(
  lines: string[],
  note: StoredSectionNote,
  anchorHashCache: Map<string, string>,
): SectionNoteDetectionResult {
  if (!isValidRangeForLines(note.range, lines.length)) {
    return {
      id: note.id,
      status: {
        content: "stale",
        anchor: "needsConfirmation",
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

function getRangeHash(
  lines: string[],
  range: LineRange,
  anchorHashCache: Map<string, string>,
): string {
  const cacheKey = `${range.startLine}:${range.endLine}`;
  const cachedHash = anchorHashCache.get(cacheKey);

  if (cachedHash) {
    return cachedHash;
  }

  const hash = createSourceHash(getRangeText(lines, range));

  anchorHashCache.set(cacheKey, hash);

  return hash;
}

function getRangeText(lines: string[], range: LineRange): string {
  return lines.slice(range.startLine - 1, range.endLine).join("\n");
}

function splitSourceLines(sourceText: string): string[] {
  return sourceText.split(/\r\n|\r|\n/);
}

function isValidRangeForLines(range: LineRange, lineCount: number): boolean {
  return (
    Number.isInteger(range.startLine) &&
    Number.isInteger(range.endLine) &&
    range.startLine >= 1 &&
    range.endLine >= range.startLine &&
    range.endLine <= lineCount
  );
}
