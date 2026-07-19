/**
 * Converts domain note models into persisted store models.
 */

import type { FileNote } from "@shared/models/domain/file";
import type { LineNote } from "@shared/models/domain/line";
import type { SectionNote } from "@shared/models/domain/section";
import type { StoreNoteFields } from "@shared/models/store/common";
import type { StoredFileNote } from "@shared/models/store/file";
import type { StoredLineNote } from "@shared/models/store/line";
import type { StoredSectionNote } from "@shared/models/store/section";
import type { ProgrammingLanguage, StoredSourceFile } from "@shared/models/store/sourceFile";
import type { WorkspaceNoteFileIndexEntry, WorkspaceNoteIndexV1 } from "@shared/models/store/workspace";
import { createSourceHash } from "@shared/utils/hashUtils";

/**
 * Input used to create a stored source-file entry.
 *
 * @example
 * const input: CreateStoredSourceFileInput = {
 *   sourceCode: "export {};",
 *   programmingLanguage: "typescript",
 *   sectionNotes: [],
 *   lineNotes: [],
 *   now: "2026-07-13T00:00:00.000Z",
 * };
 */
export type CreateStoredSourceFileInput = {
  /**
   * Current complete source code for the file.
   *
   * @example
   * "export {};"
   */
  sourceCode: string;

  /** Precomputed source fingerprint used when complete source text is unavailable. */
  sourceHash?: string;

  /** Kind of the supplied source fingerprint. */
  sourceHashKind?: "text" | "metadata";

  /**
   * VS Code TextDocument.languageId for this source file, when available.
   *
   * @example
   * "typescriptreact"
   */
  programmingLanguage?: ProgrammingLanguage;

  /**
   * Optional file-level domain note to persist.
   */
  fileNote?: FileNote;

  /**
   * Section-level domain notes to persist.
   */
  sectionNotes?: SectionNote[];

  /**
   * Line-level domain notes to persist.
   */
  lineNotes?: LineNote[];

  /**
   * ISO 8601 timestamp used for createdAt and updatedAt fields.
   *
   * @example
   * "2026-07-13T00:00:00.000Z"
   */
  now: string;
};

/**
 * Input used to create a workspace note index.
 *
 * @example
 * const input: CreateWorkspaceNoteIndexInput = {
 *   files: {},
 *   now: "2026-07-13T00:00:00.000Z",
 *   workspaceRoot: "/workspace/project",
 * };
 */
export type CreateWorkspaceNoteIndexInput = {
  /**
   * Source-file index entries indexed by workspace-relative source file path.
   */
  files: Record<string, WorkspaceNoteFileIndexEntry>;

  /**
   * ISO 8601 timestamp for when the store is written.
   *
   * @example
   * "2026-07-13T00:00:00.000Z"
   */
  now: string;

  /**
   * Optional normalized workspace root used for debugging and migration checks.
   *
   * @example
   * "/workspace/project"
   */
  workspaceRoot?: string;
};

/**
 * Adds store metadata to a file-level domain note.
 *
 * @param fileNote - File-level domain note.
 * @param now - ISO 8601 timestamp used for createdAt and updatedAt.
 * @returns Persisted file note.
 *
 * @example
 * const stored = createStoredFileNote(fileNote, "2026-07-13T00:00:00.000Z");
 */
export function createStoredFileNote(fileNote: FileNote, now: string): StoredFileNote {
  return {
    ...fileNote,
    ...createStoreNoteFields(now),
  };
}

/**
 * Adds store metadata to a section-level domain note.
 *
 * @param sectionNote - Section-level domain note.
 * @param now - ISO 8601 timestamp used for createdAt and updatedAt.
 * @returns Persisted section note.
 *
 * @example
 * const stored = createStoredSectionNote(sectionNote, "2026-07-13T00:00:00.000Z");
 */
export function createStoredSectionNote(
  sectionNote: SectionNote,
  now: string,
): StoredSectionNote {
  return {
    ...sectionNote,
    ...createStoreNoteFields(now),
  };
}

/**
 * Adds store metadata to a line-level domain note.
 *
 * @param lineNote - Line-level domain note.
 * @param now - ISO 8601 timestamp used for createdAt and updatedAt.
 * @returns Persisted line note.
 *
 * @example
 * const stored = createStoredLineNote(lineNote, "2026-07-13T00:00:00.000Z");
 */
export function createStoredLineNote(lineNote: LineNote, now: string): StoredLineNote {
  return {
    ...lineNote,
    ...createStoreNoteFields(now),
  };
}

/**
 * Creates a stored source-file entry from domain notes and current source metadata.
 *
 * @param input - Source code, optional language id, domain notes, and timestamp.
 * @returns Stored source-file entry ready to be placed in the workspace store.
 *
 * @example
 * const file = createStoredSourceFile({
 *   sourceCode: "export {};",
 *   now: "2026-07-13T00:00:00.000Z",
 * });
 */
export function createStoredSourceFile(input: CreateStoredSourceFileInput): StoredSourceFile {
  const source = {
    sourceHash: input.sourceHash ?? createSourceHash(input.sourceCode),
    ...(input.sourceHashKind ? { sourceHashKind: input.sourceHashKind } : {}),
    ...(input.programmingLanguage ? { programmingLanguage: input.programmingLanguage } : {}),
  };

  return {
    source,
    ...(input.fileNote ? { fileNote: createStoredFileNote(input.fileNote, input.now) } : {}),
    sectionNotes: [...(input.sectionNotes ?? [])]
      .sort(compareSectionNotes)
      .map((sectionNote) => createStoredSectionNote(sectionNote, input.now)),
    lineNotes: [...(input.lineNotes ?? [])]
      .sort((left, right) => left.line - right.line)
      .map((lineNote) => createStoredLineNote(lineNote, input.now)),
  };
}

/**
 * Creates a top-level workspace note index.
 *
 * @param input - File index entries, timestamp, and optional workspace root.
 * @returns Workspace note index using the current schema version.
 *
 * @example
 * const index = createWorkspaceNoteIndex({
 *   files: {},
 *   now: "2026-07-13T00:00:00.000Z",
 * });
 */
export function createWorkspaceNoteIndex(input: CreateWorkspaceNoteIndexInput): WorkspaceNoteIndexV1 {
  return {
    schemaVersion: 1,
    updatedAt: input.now,
    ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
    files: input.files,
  };
}

/**
 * Creates common store metadata for a newly persisted note.
 *
 * @param now - ISO 8601 timestamp used for createdAt and updatedAt.
 * @returns Store metadata for one note.
 *
 * @example
 * const fields = createStoreNoteFields("2026-07-13T00:00:00.000Z");
 */
function createStoreNoteFields(now: string): StoreNoteFields {
  return {
    createdAt: now,
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
function compareSectionNotes(left: SectionNote, right: SectionNote): number {
  return (
    left.range.startLine - right.range.startLine ||
    left.range.endLine - right.range.endLine ||
    left.id.localeCompare(right.id)
  );
}
