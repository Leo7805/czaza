/**
 * Compact disk representation for one source-file note document.
 */

import type { NoteStatus } from "@shared/models/domain/common";
import type { StoredFileNote } from "./file";
import type { StoredLineNote } from "./line";
import type { StoredSectionNote } from "./section";
import type { StoredSourceMetadata } from "./sourceFile";

/** Common note values shared by entries in one document. */
export type SourceFileNoteDefaults = {
  createdAt?: string;
  updatedAt?: string;
};

/** Per-note fields omitted when they match the document defaults. */
export type SourceFileNoteOverrides = {
  createdBy?: "user" | "ai";
  status?: NoteStatus;
  createdAt?: string;
  updatedAt?: string;
};

type CompactNote<TNote> = Omit<
  TNote,
  "id" | "createdBy" | "status" | "createdAt" | "updatedAt"
> & SourceFileNoteOverrides;

/** Compact file-note payload; its stable id is always `file`. */
export type FileNoteDocument = CompactNote<StoredFileNote>;

/** Compact section-note payload keyed by stable section id. */
export type SectionNoteDocument = CompactNote<StoredSectionNote>;

/** Compact line-note payload keyed by stable line-note id. */
export type LineNoteDocument = CompactNote<StoredLineNote>;

/** Compact per-source-file JSON governed by the workspace index schema. */
export type SourceFileDocument = {
  source: StoredSourceMetadata;
  defaults?: SourceFileNoteDefaults;
  fileNote?: FileNoteDocument;
  sectionNotes: Record<string, SectionNoteDocument>;
  lineNotes: Record<string, LineNoteDocument>;
};
