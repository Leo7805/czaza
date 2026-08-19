/**
 * Detects transient Note status overlays for one source resource without persistence.
 */

import type { NoteStatus } from "@shared/models/domain/common";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  detectFileNotes,
  type FileNotesDetectionReport,
} from "@shared/services/notes/noteDetectionService";
import { createSourceHash } from "@shared/utils/hashUtils";
import { getNoteStoreLocationKey } from "@vscode/notes/NoteStoreLocation";
import type { ScopedWorkspaceNoteStore } from "@vscode/notes";
import {
  evaluateCzazaResourceAccess,
  type CzazaResourceAccessDenialReason,
} from "@vscode/services/resourceAccess";
import type * as vscode from "vscode";

import type {
  RuntimeNoteIssue,
  RuntimeNoteState,
  RuntimeNoteStateCoordinates,
  RuntimeNoteTargetChange,
} from "./runtimeNoteState";

/** Minimal document shape required by read-only Runtime Note detection. */
export type RuntimeNoteDetectionDocument = {
  /** VS Code URI for the source document. */
  uri: vscode.Uri;

  /** VS Code language id, such as `typescript`, when available. */
  languageId?: string;

  /** Returns the full current document text. */
  getText(): string;
};

/** Input for detecting one source resource's transient Note state. */
export type DetectRuntimeNoteStateInput = {
  /** Current source document snapshot. */
  document: RuntimeNoteDetectionDocument;

  /** Shared Note Store used only to read existing persistent Notes. */
  notes: ScopedWorkspaceNoteStore;

  /** ISO timestamp attached to the detected runtime state. */
  now: string;

};

/** Read-only Runtime Note detection result. */
export type DetectRuntimeNoteStateResult =
  | {
    kind: "ignored";
    reason: CzazaResourceAccessDenialReason;
  }
  | {
    kind: "untracked";
    relativePath: string;
    coordinates: RuntimeNoteStateCoordinates;
  }
  | {
    kind: "current";
    relativePath: string;
    currentSourceHash: string;
    coordinates: RuntimeNoteStateCoordinates;
  }
  | {
    kind: "affected";
    relativePath: string;
    report: FileNotesDetectionReport;
    state: RuntimeNoteState;
  };

/**
 * Detects Runtime Note State for one source document without changing persistent Notes.
 *
 * @param input - Current document, Note Store reader, and observation time.
 * @returns Ignored, untracked, current, or affected detection result.
 *
 * @example
 * const result = await detectRuntimeNoteStateService({ document, notes, now });
 */
export async function detectRuntimeNoteStateService(
  input: DetectRuntimeNoteStateInput,
): Promise<DetectRuntimeNoteStateResult> {
  const access = evaluateCzazaResourceAccess(input.document.uri);

  if (!access.allowed) {
    return {
      kind: "ignored",
      reason: access.reason,
    };
  }

  const sourceFile = await input.notes.cache.getSourceFile(
    access.root.rootDirectory,
    access.settings.outputDirectory,
    access.relativePath,
  );
  const coordinates = {
    workspaceRoot: access.root.rootDirectory,
    outputDirectory: access.settings.outputDirectory,
    locationKey: getNoteStoreLocationKey(input.notes.location),
    relativePath: access.relativePath,
  };

  if (!sourceFile) {
    return {
      kind: "untracked",
      relativePath: access.relativePath,
      coordinates,
    };
  }

  const sourceText = input.document.getText();
  const currentSourceHash = createSourceHash(sourceText);

  if (sourceFile.source.sourceHash === currentSourceHash) {
    return {
      kind: "current",
      relativePath: access.relativePath,
      currentSourceHash,
      coordinates,
    };
  }

  const report = detectFileNotes(sourceText, sourceFile, {
    programmingLanguage: input.document.languageId,
  });
  const targetChanges = createTargetChanges(sourceFile, report);
  const issues = createIssues(report, targetChanges);

  if (issues.length === 0 && targetChanges.length === 0) {
    return {
      kind: "current",
      relativePath: access.relativePath,
      currentSourceHash: report.file.currentSourceHash,
      coordinates,
    };
  }

  return {
    kind: "affected",
    relativePath: access.relativePath,
    report,
    state: {
      ...coordinates,
      currentSourceHash: report.file.currentSourceHash,
      issues,
      reason: issues.includes("locationReview")
        ? "anchorChanged"
        : "sourceChanged",
      observedAt: input.now,
      targetChanges,
    },
  };
}

/**
 * Creates non-current target overlays that differ from persistent Note status.
 *
 * @param sourceFile - Existing persistent Notes.
 * @param report - Pure detection report for current source content.
 * @returns File, Section, and Line target changes requiring attention.
 */
function createTargetChanges(
  sourceFile: StoredSourceFile,
  report: FileNotesDetectionReport,
): RuntimeNoteTargetChange[] {
  const changes: RuntimeNoteTargetChange[] = [];

  if (
    sourceFile.fileNote &&
    isNonCurrentStatus(report.file.status) &&
    !isSameStatus(sourceFile.fileNote.status, report.file.status)
  ) {
    changes.push({
      kind: "file",
      status: { ...report.file.status },
    });
  }

  for (const section of report.sections) {
    const note = sourceFile.sectionNotes.find((candidate) => candidate.id === section.id);

    if (
      note &&
      isNonCurrentStatus(section.status) &&
      !isSameStatus(note.status, section.status)
    ) {
      changes.push({
        kind: "section",
        noteId: section.id,
        status: { ...section.status },
        range: { ...section.range },
      });
    }
  }

  for (const line of report.lines) {
    const note = sourceFile.lineNotes.find((candidate) => candidate.id === line.id);

    if (
      note &&
      isNonCurrentStatus(line.status) &&
      !isSameStatus(note.status, line.status)
    ) {
      changes.push({
        kind: "line",
        noteId: line.id,
        status: { ...line.status },
        line: line.line,
      });
    }
  }

  return changes;
}

/**
 * Derives resource-level issues from the detection report and target overlays.
 *
 * @param report - Pure detection report for current source content.
 * @param targetChanges - Non-current target overlays.
 * @returns Deduplicated issues suitable for Runtime State storage.
 */
function createIssues(
  report: FileNotesDetectionReport,
  targetChanges: readonly RuntimeNoteTargetChange[],
): RuntimeNoteIssue[] {
  const issues = new Set<RuntimeNoteIssue>();

  if (
    report.file.sourceHashChanged ||
    targetChanges.some((change) => change.status.content === "stale")
  ) {
    issues.add("stale");
  }

  if (targetChanges.some((change) => change.status.anchor !== "confirmed")) {
    issues.add("locationReview");
  }

  return [...issues];
}

/**
 * Reports whether a detected status represents an unresolved Note condition.
 *
 * @param status - Detected Note status.
 * @returns True for stale content or an unconfirmed anchor.
 */
function isNonCurrentStatus(status: NoteStatus): boolean {
  return status.content === "stale" || status.anchor !== "confirmed";
}

/**
 * Compares persistent and detected Note statuses.
 *
 * @param left - Existing persistent status.
 * @param right - Newly detected status.
 * @returns True when content and anchor states match.
 */
function isSameStatus(left: NoteStatus, right: NoteStatus): boolean {
  return left.content === right.content && left.anchor === right.anchor;
}
