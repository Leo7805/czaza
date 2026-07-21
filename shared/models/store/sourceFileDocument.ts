/**
 * Compact versioned disk representation for one source-file note document.
 */

import type { NoteStatus } from "@shared/models/domain/common";
import type { StoredFileNote } from "./file";
import type { StoredLineNote } from "./line";
import type { StoredSectionNote } from "./section";
import type { StoredSourceMetadata } from "./sourceFile";

/** Common note values shared by entries in one V2 document. */
export type SourceFileNoteDefaultsV2 = {
  createdAt?: string;
  updatedAt?: string;
};

/** Per-note fields omitted when they match the V2 defaults. */
export type SourceFileNoteOverridesV2 = {
  createdBy?: "user" | "ai";
  status?: NoteStatus;
  createdAt?: string;
  updatedAt?: string;
};

type CompactNoteV2<TNote> = Omit<
  TNote,
  "id" | "createdBy" | "status" | "createdAt" | "updatedAt"
> & SourceFileNoteOverridesV2;

/** Compact file-note payload; its stable id is always `file`. */
export type FileNoteDocumentV2 = CompactNoteV2<StoredFileNote>;

/** Compact section-note payload keyed by stable section id. */
export type SectionNoteDocumentV2 = CompactNoteV2<StoredSectionNote>;

/** Compact line-note payload keyed by stable line-note id. */
export type LineNoteDocumentV2 = CompactNoteV2<StoredLineNote>;

/** Version 2 per-source-file JSON written to disk. */
export type SourceFileDocumentV2 = {
  schemaVersion: 2;
  source: StoredSourceMetadata;
  defaults?: SourceFileNoteDefaultsV2;
  fileNote?: FileNoteDocumentV2;
  sectionNotes: Record<string, SectionNoteDocumentV2>;
  lineNotes: Record<string, LineNoteDocumentV2>;
};
