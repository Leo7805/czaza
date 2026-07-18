/**
 * Shared result types for workspace note store operations.
 */

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import type { FileNotesDetectionReport } from "@shared/services/notes/noteDetectionService";

/**
 * Result returned when checking notes for the current source file.
 *
 * @example
 * const result: SourceFileNoteCheckResult = {
 *   kind: "indexEntryMissing",
 *   relativeFilePath: "src/index.ts",
 * };
 */
export type SourceFileNoteCheckResult =
  | {
      /** Existing source file notes were found and checked. */
      kind: "tracked";

      /** Normalized workspace-relative source file path. */
      relativeFilePath: string;

      /** Stored source-file notes used for detection. */
      sourceFile: StoredSourceFile;

      /** Pure detection report for file, section, and line notes. */
      report: FileNotesDetectionReport;
    }
  | {
      /** The workspace index does not contain the current source path. */
      kind: "indexEntryMissing";

      /** Normalized workspace-relative source file path. */
      relativeFilePath: string;
    }
  | {
      /** The index entry exists, but the referenced note JSON is missing or invalid. */
      kind: "noteFileMissingOrInvalid";

      /** Normalized workspace-relative source file path. */
      relativeFilePath: string;
    };

/**
 * Result returned when detection statuses are applied to stored notes.
 *
 * @example
 * const result: SourceFileNoteStatusApplyResult = {
 *   kind: "indexEntryMissing",
 *   relativeFilePath: "src/index.ts",
 * };
 */
export type SourceFileNoteStatusApplyResult =
  | {
      /** Existing source file notes were found, checked, updated, and saved. */
      kind: "tracked";

      /** Normalized workspace-relative source file path. */
      relativeFilePath: string;

      /** Stored source-file notes before applying detection statuses. */
      sourceFile: StoredSourceFile;

      /** Stored source-file notes after applying detection statuses. */
      updatedSourceFile: StoredSourceFile;

      /** Detection report used to update statuses. */
      report: FileNotesDetectionReport;
    }
  | {
      /** The workspace index does not contain the current source path. */
      kind: "indexEntryMissing";

      /** Normalized workspace-relative source file path. */
      relativeFilePath: string;
    }
  | {
      /** The index entry exists, but the referenced note JSON is missing or invalid. */
      kind: "noteFileMissingOrInvalid";

      /** Normalized workspace-relative source file path. */
      relativeFilePath: string;
    };
