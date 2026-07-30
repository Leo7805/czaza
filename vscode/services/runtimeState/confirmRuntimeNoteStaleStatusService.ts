/**
 * Confirms one pure stale Runtime Note target after revalidating current source content.
 */

import { createCurrentConfirmedStatus } from "@shared/models/domain/common";
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
 * Confirms pure stale content only when the current source still matches Runtime State.
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

  if (
    change.status.content !== "stale" ||
    change.status.anchor !== "confirmed" ||
    !hasUnchangedLocation(change, sourceFile)
  ) {
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
  let next = updateProgrammingLanguage(
    updateSourceHash(sourceFile, fingerprint.hash),
    fingerprint.programmingLanguage,
  );

  if (change.kind === "file") {
    if (!sourceFile.fileNote) {
      return { kind: "unchanged" };
    }
    next = updateFileNoteStatus(next, createCurrentConfirmedStatus(), now);
  } else if (change.kind === "section") {
    const section = sourceFile.sectionNotes.find((note) => note.id === change.noteId);

    if (!section || !isValidRange(section.range.startLine, section.range.endLine, lines.length)) {
      return { kind: "unchanged" };
    }
    next = updateSectionAnchorHash(
      updateSectionNoteStatus(next, section.id, createCurrentConfirmedStatus(), now),
      section.id,
      createSourceHash(lines.slice(section.range.startLine - 1, section.range.endLine).join("\n")),
      now,
    );
  } else {
    const lineNote = sourceFile.lineNotes.find((note) => note.id === change.noteId);

    if (!lineNote || lineNote.line < 1 || lineNote.line > lines.length) {
      return { kind: "unchanged" };
    }
    next = updateLineAnchorText(
      updateLineNoteStatus(next, lineNote.id, createCurrentConfirmedStatus(), now),
      lineNote.id,
      lines[lineNote.line - 1] ?? "",
      now,
    );
  }

  await input.notes.cache.saveSourceFile(
    coordinates.workspaceRoot,
    coordinates.outputDirectory,
    coordinates.relativePath,
    next,
    now,
  );
  await refreshRuntimeNoteStateService({
    document: fingerprint.document,
    notes: input.notes,
    registry: input.registry,
    now,
  });

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
 * Reports whether confirming stale content would leave the stored target location unchanged.
 *
 * @param change - Runtime target proposed by detection.
 * @param sourceFile - Persistent source file containing current Note anchors.
 * @returns True when no implicit relocation would be accepted.
 */
function hasUnchangedLocation(
  change: RuntimeNoteTargetChange,
  sourceFile: StoredSourceFile,
): boolean {
  if (change.kind === "file") {
    return true;
  }

  if (change.kind === "section") {
    const section = sourceFile.sectionNotes.find((note) => note.id === change.noteId);
    return Boolean(
      section &&
        (!change.range ||
          (
            change.range.startLine === section.range.startLine &&
            change.range.endLine === section.range.endLine
          )),
    );
  }

  const line = sourceFile.lineNotes.find((note) => note.id === change.noteId);
  return Boolean(line && (!change.line || change.line === line.line));
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
