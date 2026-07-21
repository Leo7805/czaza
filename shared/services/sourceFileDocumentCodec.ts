/**
 * Encodes and decodes compact source-file note documents.
 */

import {
  createCurrentConfirmedStatus,
  type NoteStatus,
} from "@shared/models/domain/common";
import type { StoredFileNote } from "@shared/models/store/file";
import type { StoredLineNote } from "@shared/models/store/line";
import type { StoredSectionNote } from "@shared/models/store/section";
import type {
  FileNoteDocument,
  LineNoteDocument,
  SectionNoteDocument,
  SourceFileDocument,
  SourceFileNoteDefaults,
  SourceFileNoteOverrides,
} from "@shared/models/store/sourceFileDocument";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";

const DEFAULT_CREATED_BY = "ai" as const;

/** Decodes a compact disk document into the complete in-memory model. */
export function decodeSourceFileDocument(value: unknown): StoredSourceFile | undefined {
  if (!isSourceFileDocument(value)) {
    return undefined;
  }

  const fileNote = value.fileNote
    ? decodeNote(value.fileNote, "file", value.defaults)
    : undefined;
  const sectionNotes = decodeNoteRecord(value.sectionNotes, value.defaults);
  const lineNotes = decodeNoteRecord(value.lineNotes, value.defaults);

  if ((value.fileNote && !fileNote) || !sectionNotes || !lineNotes) {
    return undefined;
  }

  return {
    source: value.source,
    ...(fileNote ? { fileNote: fileNote as StoredFileNote } : {}),
    sectionNotes: sectionNotes as StoredSectionNote[],
    lineNotes: lineNotes as StoredLineNote[],
  };
}

/** Encodes the complete in-memory model as a compact disk document. */
export function encodeSourceFileDocument(sourceFile: StoredSourceFile): SourceFileDocument {
  const notes = [
    ...(sourceFile.fileNote ? [sourceFile.fileNote] : []),
    ...sourceFile.sectionNotes,
    ...sourceFile.lineNotes,
  ];
  const defaults = createDefaults(notes);

  return {
    source: sourceFile.source,
    ...(Object.keys(defaults).length > 0 ? { defaults } : {}),
    ...(sourceFile.fileNote
      ? { fileNote: encodeNote(sourceFile.fileNote, defaults) as FileNoteDocument }
      : {}),
    sectionNotes: Object.fromEntries(
      sourceFile.sectionNotes.map((note) => [
        note.id,
        encodeNote(note, defaults) as SectionNoteDocument,
      ]),
    ),
    lineNotes: Object.fromEntries(
      sourceFile.lineNotes.map((note) => [
        note.id,
        encodeNote(note, defaults) as LineNoteDocument,
      ]),
    ),
  };
}

/** Returns true for the compact top-level document shape. */
function isSourceFileDocument(value: unknown): value is SourceFileDocument {
  if (!isRecord(value) || !isValidSource(value.source)) {
    return false;
  }

  return (
    isOptionalDefaults(value.defaults) &&
    (value.fileNote === undefined || isRecord(value.fileNote)) &&
    isRecord(value.sectionNotes) &&
    isRecord(value.lineNotes) &&
    Object.values(value.sectionNotes).every(isRecord) &&
    Object.values(value.lineNotes).every(isRecord)
  );
}

/** Encodes one complete note, omitting fields supplied by document defaults. */
function encodeNote(
  note: StoredFileNote | StoredSectionNote | StoredLineNote,
  defaults: SourceFileNoteDefaults,
): Record<string, unknown> {
  const { id: _id, createdBy, status, createdAt, updatedAt, ...content } = note;

  return {
    ...content,
    ...(createdBy === DEFAULT_CREATED_BY ? {} : { createdBy }),
    ...(isDefaultStatus(status) ? {} : { status }),
    ...(createdAt === defaults.createdAt ? {} : { createdAt }),
    ...(updatedAt === defaults.updatedAt ? {} : { updatedAt }),
  };
}

/** Decodes every note in one id-keyed collection. */
function decodeNoteRecord(
  notes: Record<string, SectionNoteDocument> | Record<string, LineNoteDocument>,
  defaults: SourceFileNoteDefaults | undefined,
): Array<StoredSectionNote | StoredLineNote> | undefined {
  const decoded: Array<StoredSectionNote | StoredLineNote> = [];

  for (const [id, note] of Object.entries(notes)) {
    if (!id) {
      return undefined;
    }

    const decodedNote = decodeNote(note, id, defaults);

    if (!decodedNote) {
      return undefined;
    }

    decoded.push(decodedNote as StoredSectionNote | StoredLineNote);
  }

  return decoded;
}

/** Expands one compact note using schema and document defaults. */
function decodeNote(
  note: Record<string, unknown> & SourceFileNoteOverrides,
  id: string,
  defaults: SourceFileNoteDefaults | undefined,
): Record<string, unknown> | undefined {
  const createdBy = note.createdBy ?? DEFAULT_CREATED_BY;
  const status = note.status ?? createCurrentConfirmedStatus();
  const createdAt = note.createdAt ?? defaults?.createdAt;
  const updatedAt = note.updatedAt ?? defaults?.updatedAt;

  if (
    (createdBy !== "ai" && createdBy !== "user") ||
    !isNoteStatus(status) ||
    typeof createdAt !== "string" ||
    typeof updatedAt !== "string"
  ) {
    return undefined;
  }

  const {
    id: _id,
    createdBy: _createdBy,
    status: _status,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...content
  } = note;

  return { id, ...content, status, createdBy, createdAt, updatedAt };
}

/** Chooses deterministic document defaults from the most common note timestamps. */
function createDefaults(
  notes: ReadonlyArray<StoredFileNote | StoredSectionNote | StoredLineNote>,
): SourceFileNoteDefaults {
  const createdAt = findMostCommon(notes.map((note) => note.createdAt));
  const updatedAt = findMostCommon(notes.map((note) => note.updatedAt));

  return {
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

/** Selects the most frequent string, using lexical order to break ties. */
function findMostCommon(values: readonly string[]): string | undefined {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([leftValue, leftCount], [rightValue, rightCount]) =>
      rightCount - leftCount || leftValue.localeCompare(rightValue),
    )[0]?.[0];
}

/** Returns true when a note uses the implicit current/confirmed status. */
function isDefaultStatus(status: NoteStatus): boolean {
  return status.content === "current" && status.anchor === "confirmed";
}

/** Validates one decoded note status. */
function isNoteStatus(value: unknown): value is NoteStatus {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.content === "current" || value.content === "stale") &&
    (value.anchor === "confirmed" ||
      value.anchor === "needsConfirmation" ||
      value.anchor === "orphaned")
  );
}

/** Validates compact document defaults. */
function isOptionalDefaults(value: unknown): value is SourceFileNoteDefaults | undefined {
  if (value === undefined) {
    return true;
  }

  return (
    isRecord(value) &&
    (value.createdAt === undefined || typeof value.createdAt === "string") &&
    (value.updatedAt === undefined || typeof value.updatedAt === "string")
  );
}

/** Validates persisted source metadata in a compact file document. */
function isValidSource(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.sourceHash === "string" &&
    (value.sourceHashKind === undefined ||
      value.sourceHashKind === "text" ||
      value.sourceHashKind === "metadata") &&
    (value.programmingLanguage === undefined || typeof value.programmingLanguage === "string")
  );
}

/** Narrows an unknown JSON value to an object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
