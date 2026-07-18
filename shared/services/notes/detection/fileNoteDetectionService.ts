/**
 * Detects file-level note status from current source content.
 */

import type { NoteStatus } from "@shared/models/domain/common";
import type { ProgrammingLanguage, StoredSourceFile } from "@shared/models/store/sourceFile";
import { createSourceHash } from "@shared/utils/hashUtils";

/**
 * Reason describing the file-level source hash result.
 *
 * @example
 * const reason: FileNoteDetectionReason = "sourceHashChanged";
 */
export type FileNoteDetectionReason = "sourceHashMatched" | "sourceHashChanged";

/**
 * Optional current source metadata supplied by the caller.
 *
 * @example
 * const options: FileNoteDetectionOptions = {
 *   programmingLanguage: "typescriptreact",
 * };
 */
export type FileNoteDetectionOptions = {
  /**
   * Current VS Code TextDocument.languageId for the source file.
   *
   * When omitted, programming language changes are not checked.
   */
  programmingLanguage?: ProgrammingLanguage;
};

/**
 * File-level detection result for one stored file note group.
 *
 * @example
 * const result: FileNoteDetectionResult = {
 *   sourceHashChanged: true,
 *   status: { content: "stale", anchor: "confirmed" },
 *   reason: "sourceHashChanged",
 *   previousSourceHash: "sha256:old",
 *   currentSourceHash: "sha256:new",
 *   currentLineCount: 10,
 * };
 */
export type FileNoteDetectionResult = {
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
  reason: FileNoteDetectionReason;

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
 * Detects whether one file note group still matches current source content.
 *
 * @param sourceText - Current full source text.
 * @param sourceFile - Stored notes for the file being checked.
 * @param options - Optional current source metadata.
 * @returns File-level detection result.
 *
 * @example
 * const result = detectFileNote("const value = 1;", sourceFile);
 */
export function detectFileNote(
  sourceText: string,
  sourceFile: StoredSourceFile,
  options: FileNoteDetectionOptions = {},
): FileNoteDetectionResult {
  const currentSourceHash = createSourceHash(sourceText);
  const sourceHashChanged = sourceFile.source.sourceHash !== currentSourceHash;
  const programmingLanguageChanged =
    options.programmingLanguage === undefined
      ? undefined
      : sourceFile.source.programmingLanguage !== options.programmingLanguage;

  return {
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
    currentLineCount: splitSourceLines(sourceText).length,
  };
}

function splitSourceLines(sourceText: string): string[] {
  return sourceText.split(/\r\n|\r|\n/);
}
