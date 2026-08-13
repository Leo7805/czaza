/**
 * Defines the read-only data contract used by AI Agents to inspect CZaza notes.
 */

import type { StoredFileNote } from "@shared/models/store/file";
import type { StoredLineNote } from "@shared/models/store/line";
import type { StoredSectionNote } from "@shared/models/store/section";

/** Reason one requested source file could not be inspected. */
export type AgentNoteInspectionSkipReason =
  | "outsideWorkspace"
  | "sourceMissing"
  | "notTracked"
  | "noteStoreInvalid";

/** Input for inspecting the notes associated with source files. */
export type InspectAgentNotesInput = {
  /** Absolute CZaza project root. */
  workspaceRoot: string;

  /** Workspace-relative CZaza output directory. */
  outputDirectory: string;

  /** Workspace-relative source paths to inspect in request order. */
  sourcePaths: string[];
};

/** One tracked source file and the notes available to an Agent. */
export type InspectedAgentNoteFile = {
  /** Normalized workspace-relative source path. */
  sourcePath: string;

  /** Complete current source text. */
  sourceText: string;

  /** Hash calculated from the current source text. */
  sourceHash: string;

  /** Source hash recorded by the Note Store. */
  storedSourceHash: string;

  /** Existing notes grouped by their attachment level. */
  notes: {
    file?: StoredFileNote;
    sections: StoredSectionNote[];
    lines: StoredLineNote[];
  };
};

/** One requested source path that could not be inspected safely. */
export type SkippedAgentNoteInspection = {
  /** Original path supplied by the caller. */
  sourcePath: string;

  /** Stable machine-readable reason for skipping the path. */
  reason: AgentNoteInspectionSkipReason;
};

/** Ordered result of one read-only Agent note inspection. */
export type InspectAgentNotesResult = {
  /** Successfully inspected files in request order. */
  files: InspectedAgentNoteFile[];

  /** Skipped requests in request order. */
  skipped: SkippedAgentNoteInspection[];
};
