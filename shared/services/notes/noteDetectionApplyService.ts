/**
 * Applies note detection reports to stored source-file note status fields.
 */

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import type { SourceFileNoteDetectionReport } from "@shared/services/notes/noteDetectionService";
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
 * const next = applySourceFileNoteDetectionReport(sourceFile, report, now);
 */
export function applySourceFileNoteDetectionReport(
  sourceFile: StoredSourceFile,
  report: SourceFileNoteDetectionReport,
  now: string,
): StoredSourceFile {
  let next = updateFileNoteStatus(sourceFile, report.file.status, now);

  for (const section of report.sections) {
    next = updateSectionNoteStatus(next, section.id, section.status, now);
  }

  for (const line of report.lines) {
    next = updateLineNoteStatus(next, line.id, line.status, now);
  }

  return next;
}
