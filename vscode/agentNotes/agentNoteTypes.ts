/**
 * Defines the read-only data contract used by AI Agents to inspect CZaza notes.
 */

import type { StoredFileNote } from "@shared/models/store/file";
import type { StoredLineNote } from "@shared/models/store/line";
import type { StoredSectionNote } from "@shared/models/store/section";
import type { AIExplanation } from "@shared/models/ai/common";
import type { LineRange } from "@shared/models/common";

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

/** One requested AI-content update or AI Note creation. */
export type AgentNoteChange =
  | {
      action: "update";
      level: "file" | "section" | "line";
      noteId: string;
      aiExplanation: AIExplanation;
      reason: string;
    }
  | {
      action: "create";
      level: "file";
      aiExplanation: AIExplanation;
      reason: string;
    }
  | {
      action: "create";
      level: "section";
      title: string;
      kind?: string;
      range: LineRange;
      aiExplanation: AIExplanation;
      reason: string;
    }
  | {
      action: "create";
      level: "line";
      line: number;
      aiExplanation: AIExplanation;
      reason: string;
    };

/** Input for safely applying Agent-authored AI Note content. */
export type ApplyAgentNoteUpdatesInput = {
  /** Absolute CZaza project root. */
  workspaceRoot: string;
  /** Workspace-relative CZaza output directory. */
  outputDirectory: string;
  /** Source-file update batches processed in request order. */
  files: Array<{
    sourcePath: string;
    expectedSourceHash: string;
    changes: AgentNoteChange[];
  }>;
};

/** Result of one requested Agent Note change. */
export type AgentNoteChangeResult = {
  /** Whether the request changed storage or was rejected. */
  action: "updated" | "created" | "skipped" | "failed";
  /** Attachment level of the requested note. */
  noteLevel: "file" | "section" | "line";
  /** Existing or generated Note ID when available. */
  noteId?: string;
  /** Section title when the request identifies a section. */
  title?: string;
  /** Caller reason for success or safe explanation for rejection. */
  reason: string;
};

/** Ordered per-file report returned after applying Agent Note changes. */
export type AgentNoteUpdateReport = {
  /** Results grouped by requested source file. */
  files: Array<{
    sourcePath: string;
    changes: AgentNoteChangeResult[];
  }>;
  /** Totals derived from all per-file results. */
  summary: {
    filesChanged: number;
    updated: number;
    created: number;
    skipped: number;
    failed: number;
  };
};
