/**
 * Provides immutable CRUD helpers for notes inside one stored source file.
 */

import type { StoreNoteFields } from "@shared/models/store/common";
import type { StoredFileNote } from "@shared/models/store/file";
import type { StoredLineNote } from "@shared/models/store/line";
import type { StoredSectionNote } from "@shared/models/store/section";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";

/**
 * File note input accepted by upsert helpers before store timestamps are applied.
 *
 * @example
 * const note: FileNoteUpsertInput = {
 *   id: "file",
 *   createdBy: "user",
 *   status: { content: "current", anchor: "confirmed" },
 * };
 */
export type FileNoteUpsertInput = Omit<StoredFileNote, keyof StoreNoteFields> &
  Partial<StoreNoteFields>;

/**
 * Section note input accepted by upsert helpers before store timestamps are applied.
 *
 * @example
 * const note: SectionNoteUpsertInput = {
 *   id: "section:1:intro:1-3",
 *   title: "Intro",
 *   range: { startLine: 1, endLine: 3 },
 *   anchorHash: "sha256:abc123",
 *   createdBy: "user",
 *   status: { content: "current", anchor: "confirmed" },
 * };
 */
export type SectionNoteUpsertInput = Omit<StoredSectionNote, keyof StoreNoteFields> &
  Partial<StoreNoteFields>;

/**
 * Line note input accepted by upsert helpers before store timestamps are applied.
 *
 * @example
 * const note: LineNoteUpsertInput = {
 *   id: "line:1",
 *   line: 1,
 *   anchorText: "const value = 1;",
 *   createdBy: "user",
 *   status: { content: "current", anchor: "confirmed" },
 * };
 */
export type LineNoteUpsertInput = Omit<StoredLineNote, keyof StoreNoteFields> &
  Partial<StoreNoteFields>;

/**
 * Reads the file-level note from a stored source file.
 *
 * @param sourceFile - Stored source file to inspect.
 * @returns Stored file note when present.
 *
 * @example
 * const note = getFileNote(sourceFile);
 */
export function getFileNote(sourceFile: StoredSourceFile): StoredFileNote | undefined {
  return sourceFile.fileNote;
}

/**
 * Inserts or updates the file-level note.
 *
 * @param sourceFile - Stored source file to update.
 * @param fileNote - File note input before timestamps are applied.
 * @param now - ISO 8601 timestamp used for updatedAt and new createdAt values.
 * @returns Updated stored source file.
 *
 * @example
 * const next = upsertFileNote(sourceFile, fileNote, "2026-07-13T00:00:00.000Z");
 */
export function upsertFileNote(
  sourceFile: StoredSourceFile,
  fileNote: FileNoteUpsertInput,
  now: string,
): StoredSourceFile {
  return {
    ...sourceFile,
    fileNote: applyStoreTimestamps(fileNote, sourceFile.fileNote, now),
  };
}

/**
 * Deletes the file-level note when present.
 *
 * @param sourceFile - Stored source file to update.
 * @returns Updated stored source file without a file-level note.
 *
 * @example
 * const next = deleteFileNote(sourceFile);
 */
export function deleteFileNote(sourceFile: StoredSourceFile): StoredSourceFile {
  return {
    source: sourceFile.source,
    sectionNotes: sourceFile.sectionNotes,
    lineNotes: sourceFile.lineNotes,
  };
}

/**
 * Reads one section note by id.
 *
 * @param sourceFile - Stored source file to inspect.
 * @param sectionId - Stable section note id.
 * @returns Stored section note when found.
 *
 * @example
 * const note = getSectionNote(sourceFile, "section:1:intro:1-3");
 */
export function getSectionNote(
  sourceFile: StoredSourceFile,
  sectionId: string,
): StoredSectionNote | undefined {
  return sourceFile.sectionNotes.find((note) => note.id === sectionId);
}

/**
 * Inserts or updates one section note by id.
 *
 * @param sourceFile - Stored source file to update.
 * @param sectionNote - Section note input before timestamps are applied.
 * @param now - ISO 8601 timestamp used for updatedAt and new createdAt values.
 * @returns Updated stored source file with sorted section notes.
 *
 * @example
 * const next = upsertSectionNote(sourceFile, sectionNote, "2026-07-13T00:00:00.000Z");
 */
export function upsertSectionNote(
  sourceFile: StoredSourceFile,
  sectionNote: SectionNoteUpsertInput,
  now: string,
): StoredSourceFile {
  const existing = getSectionNote(sourceFile, sectionNote.id);
  const stored = applyStoreTimestamps(sectionNote, existing, now);
  const sectionNotes = [
    ...sourceFile.sectionNotes.filter((note) => note.id !== sectionNote.id),
    stored,
  ].sort(compareSectionNotes);

  return {
    ...sourceFile,
    sectionNotes,
  };
}

/**
 * Deletes one section note by id.
 *
 * @param sourceFile - Stored source file to update.
 * @param sectionId - Stable section note id.
 * @returns Updated stored source file.
 *
 * @example
 * const next = deleteSectionNote(sourceFile, "section:1:intro:1-3");
 */
export function deleteSectionNote(sourceFile: StoredSourceFile, sectionId: string): StoredSourceFile {
  return {
    ...sourceFile,
    sectionNotes: sourceFile.sectionNotes.filter((note) => note.id !== sectionId),
  };
}

/**
 * Reads one line note by id.
 *
 * @param sourceFile - Stored source file to inspect.
 * @param lineId - Stable line note id.
 * @returns Stored line note when found.
 *
 * @example
 * const note = getLineNote(sourceFile, "line:1");
 */
export function getLineNote(sourceFile: StoredSourceFile, lineId: string): StoredLineNote | undefined {
  return sourceFile.lineNotes.find((note) => note.id === lineId);
}

/**
 * Inserts or updates one line note by id.
 *
 * @param sourceFile - Stored source file to update.
 * @param lineNote - Line note input before timestamps are applied.
 * @param now - ISO 8601 timestamp used for updatedAt and new createdAt values.
 * @returns Updated stored source file with sorted line notes.
 *
 * @example
 * const next = upsertLineNote(sourceFile, lineNote, "2026-07-13T00:00:00.000Z");
 */
export function upsertLineNote(
  sourceFile: StoredSourceFile,
  lineNote: LineNoteUpsertInput,
  now: string,
): StoredSourceFile {
  const existing = getLineNote(sourceFile, lineNote.id);
  const stored = applyStoreTimestamps(lineNote, existing, now);
  const lineNotes = [
    ...sourceFile.lineNotes.filter((note) => note.id !== lineNote.id),
    stored,
  ].sort((left, right) => left.line - right.line || left.id.localeCompare(right.id));

  return {
    ...sourceFile,
    lineNotes,
  };
}

/**
 * Deletes one line note by id.
 *
 * @param sourceFile - Stored source file to update.
 * @param lineId - Stable line note id.
 * @returns Updated stored source file.
 *
 * @example
 * const next = deleteLineNote(sourceFile, "line:1");
 */
export function deleteLineNote(sourceFile: StoredSourceFile, lineId: string): StoredSourceFile {
  return {
    ...sourceFile,
    lineNotes: sourceFile.lineNotes.filter((note) => note.id !== lineId),
  };
}

/**
 * Applies createdAt and updatedAt metadata to an upserted note.
 *
 * @param next - New note content before timestamps are finalized.
 * @param existing - Existing stored note, when the operation is an update.
 * @param now - ISO 8601 timestamp used for updatedAt and new createdAt values.
 * @returns Stored note with finalized timestamps.
 *
 * @example
 * const stored = applyStoreTimestamps(note, undefined, "2026-07-13T00:00:00.000Z");
 */
function applyStoreTimestamps<TNote extends Partial<StoreNoteFields>>(
  next: TNote,
  existing: StoreNoteFields | undefined,
  now: string,
): TNote & StoreNoteFields {
  return {
    ...next,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

/**
 * Sorts section notes by source range for stable JSON output.
 *
 * @param left - First section note.
 * @param right - Second section note.
 * @returns Negative, zero, or positive sort value.
 *
 * @example
 * const sorted = [...sectionNotes].sort(compareSectionNotes);
 */
function compareSectionNotes(left: StoredSectionNote, right: StoredSectionNote): number {
  return (
    left.range.startLine - right.range.startLine ||
    left.range.endLine - right.range.endLine ||
    left.id.localeCompare(right.id)
  );
}
