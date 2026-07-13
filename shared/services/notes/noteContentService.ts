/**
 * Provides immutable content updates for notes inside one stored source file.
 */

import type { AIExplanation } from "@shared/models/ai/common";
import type { StoredFileNote } from "@shared/models/store/file";
import type { StoredLineNote } from "@shared/models/store/line";
import type { StoredSectionNote } from "@shared/models/store/section";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";

/**
 * Updates the file-level user note when the file note exists.
 *
 * Passing undefined removes the user note field.
 *
 * @param sourceFile - Stored source file to update.
 * @param userNote - Next user note content, or undefined to remove it.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = updateFileUserNote(sourceFile, "Remember this behavior.", now);
 */
export function updateFileUserNote(
  sourceFile: StoredSourceFile,
  userNote: string | undefined,
  now: string,
): StoredSourceFile {
  if (!sourceFile.fileNote) {
    return sourceFile;
  }

  return {
    ...sourceFile,
    fileNote: updateOptionalNoteField(sourceFile.fileNote, "userNote", userNote, now),
  };
}

/**
 * Updates one section note user note by id.
 *
 * Passing undefined removes the user note field.
 *
 * @param sourceFile - Stored source file to update.
 * @param sectionId - Stable section note id.
 * @param userNote - Next user note content, or undefined to remove it.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = updateSectionUserNote(sourceFile, "section:1:intro:1-3", "Check this range.", now);
 */
export function updateSectionUserNote(
  sourceFile: StoredSourceFile,
  sectionId: string,
  userNote: string | undefined,
  now: string,
): StoredSourceFile {
  return {
    ...sourceFile,
    sectionNotes: sourceFile.sectionNotes.map((note) =>
      note.id === sectionId ? updateOptionalNoteField(note, "userNote", userNote, now) : note,
    ),
  };
}

/**
 * Updates one line note user note by id.
 *
 * Passing undefined removes the user note field.
 *
 * @param sourceFile - Stored source file to update.
 * @param lineId - Stable line note id.
 * @param userNote - Next user note content, or undefined to remove it.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = updateLineUserNote(sourceFile, "line:1", "Important return point.", now);
 */
export function updateLineUserNote(
  sourceFile: StoredSourceFile,
  lineId: string,
  userNote: string | undefined,
  now: string,
): StoredSourceFile {
  return {
    ...sourceFile,
    lineNotes: sourceFile.lineNotes.map((note) =>
      note.id === lineId ? updateOptionalNoteField(note, "userNote", userNote, now) : note,
    ),
  };
}

/**
 * Updates the file-level AI explanation when the file note exists.
 *
 * Passing undefined removes the AI explanation field.
 *
 * @param sourceFile - Stored source file to update.
 * @param aiExplanation - Next AI explanation, or undefined to remove it.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = updateFileAiExplanation(sourceFile, { summary: "Reads settings.", detail: "..." }, now);
 */
export function updateFileAiExplanation(
  sourceFile: StoredSourceFile,
  aiExplanation: AIExplanation | undefined,
  now: string,
): StoredSourceFile {
  if (!sourceFile.fileNote) {
    return sourceFile;
  }

  return {
    ...sourceFile,
    fileNote: updateOptionalNoteField(sourceFile.fileNote, "aiExplanation", aiExplanation, now),
  };
}

/**
 * Updates one section note AI explanation by id.
 *
 * Passing undefined removes the AI explanation field.
 *
 * @param sourceFile - Stored source file to update.
 * @param sectionId - Stable section note id.
 * @param aiExplanation - Next AI explanation, or undefined to remove it.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = updateSectionAiExplanation(sourceFile, "section:1:intro:1-3", explanation, now);
 */
export function updateSectionAiExplanation(
  sourceFile: StoredSourceFile,
  sectionId: string,
  aiExplanation: AIExplanation | undefined,
  now: string,
): StoredSourceFile {
  return {
    ...sourceFile,
    sectionNotes: sourceFile.sectionNotes.map((note) =>
      note.id === sectionId ? updateOptionalNoteField(note, "aiExplanation", aiExplanation, now) : note,
    ),
  };
}

/**
 * Updates one line note AI explanation by id.
 *
 * Passing undefined removes the AI explanation field.
 *
 * @param sourceFile - Stored source file to update.
 * @param lineId - Stable line note id.
 * @param aiExplanation - Next AI explanation, or undefined to remove it.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = updateLineAiExplanation(sourceFile, "line:1", explanation, now);
 */
export function updateLineAiExplanation(
  sourceFile: StoredSourceFile,
  lineId: string,
  aiExplanation: AIExplanation | undefined,
  now: string,
): StoredSourceFile {
  return {
    ...sourceFile,
    lineNotes: sourceFile.lineNotes.map((note) =>
      note.id === lineId ? updateOptionalNoteField(note, "aiExplanation", aiExplanation, now) : note,
    ),
  };
}

/**
 * Updates one section note title by id.
 *
 * @param sourceFile - Stored source file to update.
 * @param sectionId - Stable section note id.
 * @param title - Next section title.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = updateSectionTitle(sourceFile, "section:1:intro:1-3", "New title", now);
 */
export function updateSectionTitle(
  sourceFile: StoredSourceFile,
  sectionId: string,
  title: string,
  now: string,
): StoredSourceFile {
  return {
    ...sourceFile,
    sectionNotes: sourceFile.sectionNotes.map((note) =>
      note.id === sectionId
        ? {
            ...note,
            title,
            updatedAt: now,
          }
        : note,
    ),
  };
}

/**
 * Updates one section note kind by id.
 *
 * Passing undefined removes the kind field.
 *
 * @param sourceFile - Stored source file to update.
 * @param sectionId - Stable section note id.
 * @param kind - Next section kind, or undefined to remove it.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored source file.
 *
 * @example
 * const next = updateSectionKind(sourceFile, "section:1:intro:1-3", "setup", now);
 */
export function updateSectionKind(
  sourceFile: StoredSourceFile,
  sectionId: string,
  kind: string | undefined,
  now: string,
): StoredSourceFile {
  return {
    ...sourceFile,
    sectionNotes: sourceFile.sectionNotes.map((note) =>
      note.id === sectionId ? updateOptionalNoteField(note, "kind", kind, now) : note,
    ),
  };
}

/**
 * Updates or removes an optional content field on one stored note.
 *
 * @param note - Stored note to update.
 * @param field - Optional content field name.
 * @param value - Next field value, or undefined to remove it.
 * @param now - ISO 8601 timestamp used for updatedAt.
 * @returns Updated stored note.
 *
 * @example
 * const note = updateOptionalNoteField(existing, "userNote", "New note.", now);
 */
function updateOptionalNoteField<
  TNote extends StoredFileNote | StoredSectionNote | StoredLineNote,
  TField extends "userNote" | "aiExplanation" | "kind",
>(
  note: TNote,
  field: TField,
  value: string | AIExplanation | undefined,
  now: string,
): TNote {
  const next = {
    ...note,
    updatedAt: now,
  } as TNote & Record<TField, string | AIExplanation | undefined>;

  if (value === undefined) {
    delete next[field];
    return next as TNote;
  }

  return {
    ...next,
    [field]: value,
  } as TNote;
}
