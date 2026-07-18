/**
 * Applies note detection reports to stored source-file note status fields.
 */

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import type { FileNotesDetectionReport } from "@shared/services/notes/noteDetectionService";
import type { NoteStatus } from "@shared/models/domain/common";
import {
  updateFileNoteStatus,
  updateLineNoteStatus,
  updateSectionNoteStatus,
} from "@shared/services/notes/noteStatusService";

/**
 * Applies suggested statuses from a detection report to stored notes.
 *
 * This function only updates note status and updatedAt. It does not update
 * sourceHash, programmingLanguage, section ranges, section anchor hashes, line
 * numbers, line anchor text, user notes, or AI explanations.
 *
 * @param sourceFile - Stored source file to update.
 * @param report - Detection report containing suggested note statuses.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = applyFileNotesDetectionReport(sourceFile, report, now);
 */
export function applyFileNotesDetectionReport(
  sourceFile: StoredSourceFile,
  report: FileNotesDetectionReport,
  now: string,
): StoredSourceFile {
  let next = updateFileNoteStatus(
    sourceFile,
    mergeDetectionStatus(sourceFile.fileNote?.status, report.file.status),
    now,
  );

  for (const section of report.sections) {
    const existing = next.sectionNotes.find((note) => note.id === section.id);

    next = updateSectionNoteStatus(
      next,
      section.id,
      mergeDetectionStatus(existing?.status, section.status),
      now,
    );
  }

  for (const line of report.lines) {
    const existing = next.lineNotes.find((note) => note.id === line.id);

    next = updateLineNoteStatus(
      next,
      line.id,
      mergeDetectionStatus(existing?.status, line.status),
      now,
    );
  }

  return next;
}

function mergeDetectionStatus(
  existing: NoteStatus | undefined,
  detected: NoteStatus,
): NoteStatus {
  if (!existing) {
    return detected;
  }

  return {
    content: existing.content === "stale" || detected.content === "stale" ? "stale" : "current",
    anchor:
      getAnchorSeverity(existing.anchor) >= getAnchorSeverity(detected.anchor)
        ? existing.anchor
        : detected.anchor,
  };
}

function getAnchorSeverity(anchor: NoteStatus["anchor"]): number {
  if (anchor === "orphaned") {
    return 2;
  }

  if (anchor === "needsConfirmation") {
    return 1;
  }

  return 0;
}
