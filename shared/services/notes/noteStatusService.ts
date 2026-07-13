/**
 * Provides immutable status updates for notes inside one stored source file.
 */

import type { NoteStatus } from "@shared/models/domain/common";
import type { StoredFileNote } from "@shared/models/store/file";
import type { StoredLineNote } from "@shared/models/store/line";
import type { StoredSectionNote } from "@shared/models/store/section";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";

/**
 * Updates the file-level note status when the note exists.
 *
 * @param sourceFile - Stored source file to update.
 * @param status - Next file note status.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = updateFileNoteStatus(sourceFile, { content: "stale", anchor: "confirmed" }, now);
 */
export function updateFileNoteStatus(
  sourceFile: StoredSourceFile,
  status: NoteStatus,
  now: string,
): StoredSourceFile {
  if (!sourceFile.fileNote) {
    return sourceFile;
  }

  return {
    ...sourceFile,
    fileNote: updateStoredNoteStatus(sourceFile.fileNote, status, now),
  };
}

/**
 * Updates one section note status by id.
 *
 * @param sourceFile - Stored source file to update.
 * @param sectionId - Stable section note id.
 * @param status - Next section note status.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = updateSectionNoteStatus(sourceFile, "section:1:intro:1-3", status, now);
 */
export function updateSectionNoteStatus(
  sourceFile: StoredSourceFile,
  sectionId: string,
  status: NoteStatus,
  now: string,
): StoredSourceFile {
  return {
    ...sourceFile,
    sectionNotes: sourceFile.sectionNotes.map((note) =>
      note.id === sectionId ? updateStoredNoteStatus(note, status, now) : note,
    ),
  };
}

/**
 * Updates one line note status by id.
 *
 * @param sourceFile - Stored source file to update.
 * @param lineId - Stable line note id.
 * @param status - Next line note status.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = updateLineNoteStatus(sourceFile, "line:1", status, now);
 */
export function updateLineNoteStatus(
  sourceFile: StoredSourceFile,
  lineId: string,
  status: NoteStatus,
  now: string,
): StoredSourceFile {
  return {
    ...sourceFile,
    lineNotes: sourceFile.lineNotes.map((note) =>
      note.id === lineId ? updateStoredNoteStatus(note, status, now) : note,
    ),
  };
}

/**
 * Marks every existing note in a source file as stale.
 *
 * This only changes content freshness. Anchor status is preserved because stale
 * content does not automatically mean the code target is lost.
 *
 * @param sourceFile - Stored source file to update.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = markSourceFileNotesStale(sourceFile, now);
 */
export function markSourceFileNotesStale(sourceFile: StoredSourceFile, now: string): StoredSourceFile {
  return mapAllNotes(sourceFile, (note) =>
    updateStoredNoteStatus(note, { ...note.status, content: "stale" }, now),
  );
}

/**
 * Marks every existing note in a source file as current and confirmed.
 *
 * @param sourceFile - Stored source file to update.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = markSourceFileNotesCurrentConfirmed(sourceFile, now);
 */
export function markSourceFileNotesCurrentConfirmed(
  sourceFile: StoredSourceFile,
  now: string,
): StoredSourceFile {
  return mapAllNotes(sourceFile, (note) =>
    updateStoredNoteStatus(note, { content: "current", anchor: "confirmed" }, now),
  );
}

/**
 * Updates the status and timestamp of one stored note.
 *
 * @param note - Stored note to update.
 * @param status - Next note status.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored note.
 *
 * @example
 * const note = updateStoredNoteStatus(existing, { content: "current", anchor: "confirmed" }, now);
 */
function updateStoredNoteStatus<TNote extends { status: NoteStatus; updatedAt: string }>(
  note: TNote,
  status: NoteStatus,
  now: string,
): TNote {
  return {
    ...note,
    status,
    updatedAt: now,
  };
}

/**
 * Applies a note mapper to every existing note in a stored source file.
 *
 * @param sourceFile - Stored source file to update.
 * @param mapNote - Mapper applied to file, section, and line notes.
 * @returns Updated stored source file.
 *
 * @example
 * const next = mapAllNotes(sourceFile, (note) => note);
 */
function mapAllNotes(
  sourceFile: StoredSourceFile,
  mapNote: <TNote extends StoredFileNote | StoredSectionNote | StoredLineNote>(note: TNote) => TNote,
): StoredSourceFile {
  return {
    ...sourceFile,
    ...(sourceFile.fileNote ? { fileNote: mapNote(sourceFile.fileNote) } : {}),
    sectionNotes: sourceFile.sectionNotes.map((note) => mapNote(note)),
    lineNotes: sourceFile.lineNotes.map((note) => mapNote(note)),
  };
}
