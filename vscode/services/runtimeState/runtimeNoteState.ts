/**
 * Defines in-memory Note status overlays produced by source-change detection.
 */

import type { NoteStatus } from "@shared/models/domain/common";

/** Runtime issues that may require user review without changing the Note Store. */
export type RuntimeNoteIssue =
  | "stale"
  | "locationReview"
  | "missing"
  | "possibleRename";

/** Reasons why a runtime Note state was created or retained. */
export type RuntimeNoteStateReason =
  | "sourceChanged"
  | "anchorChanged"
  | "resourceMissing"
  | "renameDetected"
  | "candidateRejected"
  | "persistenceFailed";

/** Proposed one-based Section Note range held outside the persistent Note Store. */
export type RuntimeSectionRange = {
  startLine: number;
  endLine: number;
};

/** Runtime status overlay for the File Note attached to one source resource. */
export type RuntimeFileNoteChange = {
  kind: "file";
  status: NoteStatus;
};

/** Runtime status and optional range overlay for one Section Note. */
export type RuntimeSectionNoteChange = {
  kind: "section";
  noteId: string;
  status: NoteStatus;
  range?: RuntimeSectionRange;
};

/** Runtime status and optional line overlay for one Line Note. */
export type RuntimeLineNoteChange = {
  kind: "line";
  noteId: string;
  status: NoteStatus;
  line?: number;
};

/** One target-level change proposed by runtime source detection. */
export type RuntimeNoteTargetChange =
  | RuntimeFileNoteChange
  | RuntimeSectionNoteChange
  | RuntimeLineNoteChange;

/** In-memory detection state for one source resource. */
export type RuntimeNoteState = {
  workspaceRoot: string;
  outputDirectory: string;
  relativePath: string;
  currentSourceHash?: string;
  issues: readonly RuntimeNoteIssue[];
  reason: RuntimeNoteStateReason;
  observedAt: string;
  relatedRelativePath?: string;
  targetChanges: readonly RuntimeNoteTargetChange[];
};

/** Coordinates identifying one source resource in the runtime registry. */
export type RuntimeNoteStateCoordinates = {
  workspaceRoot: string;
  outputDirectory: string;
  relativePath: string;
};

/** Coordinates identifying one workspace Note Store scope. */
export type RuntimeNoteStateScope = {
  workspaceRoot: string;
  outputDirectory: string;
};

/** Runtime registry mutation reported to UI or lifecycle consumers. */
export type RuntimeNoteStateChange =
  | {
    kind: "set";
    state: RuntimeNoteState;
    previousState?: RuntimeNoteState;
  }
  | {
    kind: "delete";
    previousState: RuntimeNoteState;
  }
  | {
    kind: "move";
    state: RuntimeNoteState;
    previousState: RuntimeNoteState;
  }
  | {
    kind: "clear";
    scope: RuntimeNoteStateScope;
    previousStates: readonly RuntimeNoteState[];
  };

/** Listener notified after an in-memory runtime state mutation. */
export type RuntimeNoteStateListener = (change: RuntimeNoteStateChange) => void;

/** Disposable registration returned by runtime state subscriptions. */
export type RuntimeNoteStateDisposable = {
  dispose(): void;
};
