/**
 * Defines the read-only data contract used by AI Agents to inspect CZaza notes.
 */

import type { StoredFileNote } from "@shared/models/store/file";
import type { StoredLineNote } from "@shared/models/store/line";
import type { StoredSectionNote } from "@shared/models/store/section";
import type { AIExplanation } from "@shared/models/ai/common";
import type { LineRange } from "@shared/models/common";
import type { NoteStoreLocation } from "@vscode/notes";
import type { AiResponseLanguage } from "@vscode/config/aiCatalog";

/** Human-readable identity of the Notes space used by an Agent operation. */
export type AgentNoteOwner =
  | { kind: "team"; label: "Team Notes" }
  | { kind: "personal"; memberId: string; displayName: string; label: string };

/** Input for resolving the Notes space currently displayed by CZaza. */
export type CurrentAgentNotesInput = {
  workspaceRoot: string;
  outputDirectory: string;
};

/** Verified current Notes space returned to an Agent before inspection. */
export type CurrentAgentNotesResult = CurrentAgentNotesInput & {
  location: NoteStoreLocation;
  responseLanguage: AiResponseLanguage;
  owner: AgentNoteOwner;
  updatedAt: string;
};

/** Reason one requested source file could not be inspected. */
export type AgentNoteInspectionSkipReason =
  | "outsideWorkspace"
  | "sourceMissing"
  | "noteStoreInvalid";

/** Input for inspecting the notes associated with source files. */
export type InspectAgentNotesInput = {
  /** Absolute CZaza project root. */
  workspaceRoot: string;

  /** Workspace-relative CZaza output directory. */
  outputDirectory: string;

  /** Exact Team or Personal Note Store to inspect. */
  location: NoteStoreLocation;

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

  /** Source hash recorded by the Note Store, absent for a new source file. */
  storedSourceHash?: string;

  /** Whether the selected Note Store already contains this source file. */
  registeredInNotes: boolean;

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
  /** Verified owner of the inspected Notes space. */
  owner: AgentNoteOwner;
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
export type AgentNoteUpdatePlan = {
  /** Absolute CZaza project root. */
  workspaceRoot: string;
  /** Workspace-relative CZaza output directory. */
  outputDirectory: string;
  /** Exact Team or Personal Note Store approved for modification. */
  location: NoteStoreLocation;
  /** Source-file update batches processed in request order. */
  files: Array<{
    sourcePath: string;
    expectedSourceHash: string;
    changes: AgentNoteChange[];
  }>;
};

/** Confirmed input for safely applying Agent-authored AI Note content. */
export type ApplyAgentNoteUpdatesInput = AgentNoteUpdatePlan & {
  /** Fingerprint returned for this exact owner and update plan before confirmation. */
  confirmationToken: string;
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
  /** Verified owner of the modified Notes space. */
  owner: AgentNoteOwner;
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
