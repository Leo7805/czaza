/**
 * Confirms one stale Runtime Note target after revalidating current source content.
 */

import type { NoteStatus } from "@shared/models/domain/common";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  updateLineAnchorText,
  updateProgrammingLanguage,
  updateSectionAnchorHash,
  updateSourceHash,
} from "@shared/services/notes/noteAnchorService";
import {
  updateFileNoteStatus,
  updateLineNoteStatus,
  updateSectionNoteStatus,
} from "@shared/services/notes/noteStatusService";
import { createSourceHash } from "@shared/utils/hashUtils";
import type { WorkspaceNoteStore } from "@vscode/notes";
import { getResourceFingerprint } from "@vscode/services/resourceFingerprint/getResourceFingerprintService";
import {
  evaluateCzazaResourceAccess,
} from "@vscode/services/resourceAccess";
import type { UserNoteTarget } from "@vscode/services/saveUserNoteService";
import type * as vscode from "vscode";

import { RuntimeNoteStateRegistry } from "./RuntimeNoteStateRegistry";
import { refreshRuntimeNoteStateService } from "./refreshRuntimeNoteStateService";
import type {
  RuntimeNoteIssue,
  RuntimeNoteState,
  RuntimeNoteTargetChange,
} from "./runtimeNoteState";

/** Result of one Runtime stale confirmation attempt. */
export type ConfirmRuntimeNoteStaleStatusResult =
  | { kind: "notRuntime" }
  | { kind: "notConfirmable" }
  | { kind: "outdated" }
  | { kind: "confirmed" }
  | { kind: "unchanged" };

/** Input required to confirm one Runtime stale Note target. */
export type ConfirmRuntimeNoteStaleStatusInput = {
  /** Source resource that owns the Runtime State. */
  uri: vscode.Uri;

  /** Shared persistent Note Store. */
  notes: WorkspaceNoteStore;

  /** Shared session-only Runtime State registry. */
  registry: RuntimeNoteStateRegistry;

  /** File, Section, or Line target selected in the WebView. */
  target: UserNoteTarget;
};

/**
 * Confirms stale content while preserving independent location-review state.
 *
 * @param input - Resource, Note Store, Registry, and selected target.
 * @returns Confirmation outcome used to choose Runtime or legacy handling.
 */
export async function confirmRuntimeNoteStaleStatusService(
  input: ConfirmRuntimeNoteStaleStatusInput,
): Promise<ConfirmRuntimeNoteStaleStatusResult> {
  const access = evaluateCzazaResourceAccess(input.uri);

  if (!access.allowed) {
    return { kind: "notRuntime" };
  }

  const coordinates = {
    workspaceRoot: access.root.rootDirectory,
    outputDirectory: access.settings.outputDirectory,
    relativePath: access.relativePath,
  };
  const state = input.registry.getState(coordinates);
  const sourceFile = await input.notes.cache.getSourceFile(
    coordinates.workspaceRoot,
    coordinates.outputDirectory,
    coordinates.relativePath,
  );

  if (!state || !sourceFile) {
    return { kind: "notRuntime" };
  }

  const change = findTargetChange(state, sourceFile, input.target);

  if (!change) {
    return { kind: "notRuntime" };
  }

  if (change.status.content !== "stale") {
    return { kind: "notConfirmable" };
  }

  const fingerprint = await getResourceFingerprint(input.uri);

  if (
    fingerprint.kind !== "text" ||
    !state.currentSourceHash ||
    fingerprint.hash !== state.currentSourceHash
  ) {
    if (fingerprint.kind === "text") {
      await refreshRuntimeNoteStateService({
        document: fingerprint.document,
        notes: input.notes,
        registry: input.registry,
        now: new Date().toISOString(),
      });
    }
    return { kind: "outdated" };
  }

  const now = new Date().toISOString();
  const lines = fingerprint.document.getText().split(/\r\n|\r|\n/);
  const clearedStatus = clearContentStatus(change.status);
  let next = updateProgrammingLanguage(
    updateSourceHash(sourceFile, fingerprint.hash),
    fingerprint.programmingLanguage,
  );

  if (change.kind === "file") {
    if (!sourceFile.fileNote) {
      return { kind: "unchanged" };
    }
    next = updateFileNoteStatus(next, clearedStatus, now);
  } else if (change.kind === "section") {
    const section = sourceFile.sectionNotes.find((note) => note.id === change.noteId);

    if (!section) {
      return { kind: "unchanged" };
    }

    next = updateSectionNoteStatus(next, section.id, clearedStatus, now);

    if (clearedStatus.anchor === "confirmed") {
      if (!isValidRange(section.range.startLine, section.range.endLine, lines.length)) {
        return { kind: "unchanged" };
      }

      next = updateSectionAnchorHash(
        next,
        section.id,
        createSourceHash(lines.slice(section.range.startLine - 1, section.range.endLine).join("\n")),
        now,
      );
    }
  } else {
    const lineNote = sourceFile.lineNotes.find((note) => note.id === change.noteId);

    if (!lineNote) {
      return { kind: "unchanged" };
    }

    next = updateLineNoteStatus(next, lineNote.id, clearedStatus, now);

    if (clearedStatus.anchor === "confirmed") {
      if (lineNote.line < 1 || lineNote.line > lines.length) {
        return { kind: "unchanged" };
      }

      next = updateLineAnchorText(
        next,
        lineNote.id,
        lines[lineNote.line - 1] ?? "",
        now,
      );
    }
  }

  await input.notes.cache.saveSourceFile(
    coordinates.workspaceRoot,
    coordinates.outputDirectory,
    coordinates.relativePath,
    next,
    now,
  );
  reconcileConfirmedRuntimeTarget(input.registry, state, change, clearedStatus);

  return { kind: "confirmed" };
}

/**
 * Finds the Runtime target represented by one WebView user-note target.
 *
 * @param state - Runtime State for the current resource.
 * @param sourceFile - Persistent source file used to resolve Line Note identity.
 * @param target - File, Section, or Line target from the WebView.
 * @returns Matching Runtime target change, when present.
 */
function findTargetChange(
  state: RuntimeNoteState,
  sourceFile: StoredSourceFile | undefined,
  target: UserNoteTarget,
): RuntimeNoteTargetChange | undefined {
  if (!sourceFile) {
    return undefined;
  }

  if (target.level === "file") {
    return state.targetChanges.find((change) => change.kind === "file");
  }

  if (target.level === "section") {
    return state.targetChanges.find(
      (change) => change.kind === "section" && change.noteId === target.sectionId,
    );
  }

  const lineId = sourceFile.lineNotes.find((note) => note.line === target.line)?.id;
  return state.targetChanges.find(
    (change) => change.kind === "line" && change.noteId === lineId,
  );
}

/**
 * Clears only content staleness and preserves the target's anchor-review state.
 *
 * @param status - Runtime status currently shown for the target.
 * @returns Content-current status with the original anchor state.
 */
function clearContentStatus(status: NoteStatus): NoteStatus {
  return {
    content: "current",
    anchor: status.anchor,
  };
}

/**
 * Removes only the confirmed stale dimension from one Runtime target.
 *
 * Location-review targets and their proposed positions remain in memory;
 * fully current targets are removed from the Runtime overlay.
 *
 * @param registry - Registry that owns the current resource state.
 * @param state - Runtime state read before the guarded write.
 * @param confirmedChange - Target whose content staleness was confirmed.
 * @param clearedStatus - Content-current status persisted for the target.
 * @returns Nothing.
 */
function reconcileConfirmedRuntimeTarget(
  registry: RuntimeNoteStateRegistry,
  state: RuntimeNoteState,
  confirmedChange: RuntimeNoteTargetChange,
  clearedStatus: NoteStatus,
): void {
  const targetChanges = state.targetChanges
    .map((change) =>
      isSameTargetChange(change, confirmedChange)
        ? { ...change, status: clearedStatus }
        : change,
    )
    .filter((change) =>
      change.status.content === "stale" || change.status.anchor !== "confirmed",
    );
  const issues = createReconciledIssues(state.issues, targetChanges);

  if (issues.length === 0 && targetChanges.length === 0) {
    registry.deleteState(state);
    return;
  }

  registry.setState({
    ...state,
    issues,
    targetChanges,
  });
}

/**
 * Compares Runtime changes by their stable target identity.
 *
 * @param left - First Runtime target.
 * @param right - Second Runtime target.
 * @returns True when both changes describe the same Note.
 */
function isSameTargetChange(
  left: RuntimeNoteTargetChange,
  right: RuntimeNoteTargetChange,
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === "file") {
    return true;
  }

  if (left.kind === "section" && right.kind === "section") {
    return left.noteId === right.noteId;
  }

  return left.kind === "line" &&
    right.kind === "line" &&
    left.noteId === right.noteId;
}

/**
 * Rebuilds status-derived issues while preserving unrelated resource issues.
 *
 * @param previousIssues - Issues stored before confirmation.
 * @param targetChanges - Runtime targets remaining after confirmation.
 * @returns Deduplicated issues for the reconciled Runtime state.
 */
function createReconciledIssues(
  previousIssues: readonly RuntimeNoteIssue[],
  targetChanges: readonly RuntimeNoteTargetChange[],
): RuntimeNoteIssue[] {
  const issues = new Set<RuntimeNoteIssue>(
    previousIssues.filter(
      (issue) => issue !== "stale" && issue !== "locationReview",
    ),
  );

  if (targetChanges.some((change) => change.status.content === "stale")) {
    issues.add("stale");
  }

  if (targetChanges.some((change) => change.status.anchor !== "confirmed")) {
    issues.add("locationReview");
  }

  return [...issues];
}

/**
 * Validates a one-based inclusive range against current source lines.
 *
 * @param startLine - First one-based line.
 * @param endLine - Last one-based line.
 * @param lineCount - Current number of source lines.
 * @returns True when the range can be hashed safely.
 */
function isValidRange(startLine: number, endLine: number, lineCount: number): boolean {
  return (
    Number.isInteger(startLine) &&
    Number.isInteger(endLine) &&
    startLine >= 1 &&
    endLine >= startLine &&
    endLine <= lineCount
  );
}
