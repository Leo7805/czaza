/**
 * Records a missing tracked source as session-only Runtime Note State.
 */

import type * as vscode from "vscode";

import type { ScopedWorkspaceNoteStore } from "@vscode/notes";
import { getNoteStoreLocationKey } from "@vscode/notes/NoteStoreLocation";
import {
  evaluateCzazaResourceAccess,
  type CzazaResourceAccessDenialReason,
} from "@vscode/services/resourceAccess";

import { RuntimeNoteStateRegistry } from "./RuntimeNoteStateRegistry";
import type {
  RuntimeNoteState,
  RuntimeNoteStateCoordinates,
} from "./runtimeNoteState";

/** Result of refreshing Runtime State for one missing source resource. */
export type RefreshMissingRuntimeNoteStateResult =
  | {
      kind: "ignored";
      reason: CzazaResourceAccessDenialReason;
      registryChange: "none";
    }
  | {
      kind: "untracked";
      coordinates: RuntimeNoteStateCoordinates;
      registryChange: "deleted" | "none";
    }
  | {
      kind: "affected";
      state: RuntimeNoteState;
      registryChange: "set";
    };

/**
 * Stores a `missing` Runtime State only when the deleted source has tracked Notes.
 *
 * @param input - Deleted URI, persistent Note reader, Runtime Registry, and timestamp.
 * @returns Detection outcome and performed registry mutation.
 */
export async function refreshMissingRuntimeNoteStateService(input: {
  uri: vscode.Uri;
  notes: ScopedWorkspaceNoteStore;
  registry: RuntimeNoteStateRegistry;
  now: string;
}): Promise<RefreshMissingRuntimeNoteStateResult> {
  const access = evaluateCzazaResourceAccess(input.uri);

  if (!access.allowed) {
    return {
      kind: "ignored",
      reason: access.reason,
      registryChange: "none",
    };
  }

  const coordinates = {
    workspaceRoot: access.root.rootDirectory,
    outputDirectory: access.settings.outputDirectory,
    locationKey: getNoteStoreLocationKey(input.notes.location),
    relativePath: access.relativePath,
  };
  const sourceFile = await input.notes.cache.getSourceFile(
    coordinates.workspaceRoot,
    coordinates.outputDirectory,
    coordinates.relativePath,
  );

  if (!sourceFile) {
    const deleted = input.registry.deleteState(coordinates);
    return {
      kind: "untracked",
      coordinates,
      registryChange: deleted ? "deleted" : "none",
    };
  }

  const state: RuntimeNoteState = {
    ...coordinates,
    issues: ["missing", "locationReview"],
    reason: "resourceMissing",
    observedAt: input.now,
    targetChanges: [
      {
        kind: "file",
        status: {
          content: sourceFile.fileNote?.status.content ?? "current",
          anchor: "needsConfirmation",
        },
      },
    ],
  };

  input.registry.setState(state);
  return {
    kind: "affected",
    state,
    registryChange: "set",
  };
}
