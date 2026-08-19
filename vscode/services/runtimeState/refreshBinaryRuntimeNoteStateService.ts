/**
 * Reconciles binary resource metadata changes with session-only Runtime Note State.
 */

import type { ScopedWorkspaceNoteStore } from "@vscode/notes";
import { getNoteStoreLocationKey } from "@vscode/notes/NoteStoreLocation";
import {
  evaluateCzazaResourceAccess,
  type CzazaResourceAccessDenialReason,
} from "@vscode/services/resourceAccess";
import type * as vscode from "vscode";

import { RuntimeNoteStateRegistry } from "./RuntimeNoteStateRegistry";
import type { RuntimeNoteRegistryChange } from "./refreshRuntimeNoteStateService";
import type {
  RuntimeNoteState,
  RuntimeNoteStateCoordinates,
} from "./runtimeNoteState";

/** Input for refreshing one binary resource's Runtime Note State. */
export type RefreshBinaryRuntimeNoteStateInput = {
  /** Binary source resource that produced the metadata fingerprint. */
  uri: vscode.Uri;

  /** Current metadata hash returned by resource fingerprinting. */
  currentSourceHash: string;

  /** Shared persistent Note Store used only for reads. */
  notes: ScopedWorkspaceNoteStore;

  /** Session-only registry receiving the detected state. */
  registry: RuntimeNoteStateRegistry;

  /** ISO timestamp recorded with an affected state. */
  now: string;

  /** Optional final check that rejects an obsolete asynchronous result. */
  canApply?: () => boolean;
};

/** Result of one binary Runtime Note State refresh. */
export type RefreshBinaryRuntimeNoteStateResult =
  | {
      kind: "ignored";
      reason: CzazaResourceAccessDenialReason;
      registryChange: "none";
    }
  | {
      kind: "untracked" | "current";
      coordinates: RuntimeNoteStateCoordinates;
      registryChange: RuntimeNoteRegistryChange;
    }
  | {
      kind: "cancelled";
      coordinates: RuntimeNoteStateCoordinates;
      registryChange: "none";
    }
  | {
      kind: "affected";
      state: RuntimeNoteState;
      registryChange: RuntimeNoteRegistryChange;
    };

/**
 * Refreshes file-level Runtime State for a binary resource without writing Notes.
 *
 * Binary metadata cannot support Section or Line detection, so a changed
 * fingerprint creates only a File stale overlay.
 *
 * @param input - Binary fingerprint, Note Store reader, and Runtime Registry.
 * @returns Detection outcome and the performed registry mutation.
 */
export async function refreshBinaryRuntimeNoteStateService(
  input: RefreshBinaryRuntimeNoteStateInput,
): Promise<RefreshBinaryRuntimeNoteStateResult> {
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

  if (input.canApply?.() === false) {
    return {
      kind: "cancelled",
      coordinates,
      registryChange: "none",
    };
  }

  if (!sourceFile) {
    const deleted = input.registry.deleteState(coordinates);
    return {
      kind: "untracked",
      coordinates,
      registryChange: deleted ? "deleted" : "none",
    };
  }

  if (sourceFile.source.sourceHash === input.currentSourceHash) {
    const deleted = input.registry.deleteState(coordinates);
    return {
      kind: "current",
      coordinates,
      registryChange: deleted ? "deleted" : "none",
    };
  }

  const state: RuntimeNoteState = {
    ...coordinates,
    currentSourceHash: input.currentSourceHash,
    issues: ["stale"],
    reason: "sourceChanged",
    observedAt: input.now,
    targetChanges: sourceFile.fileNote
      ? [
          {
            kind: "file",
            status: {
              content: "stale",
              anchor: "confirmed",
            },
          },
        ]
      : [],
  };

  input.registry.setState(state);
  return {
    kind: "affected",
    state,
    registryChange: "set",
  };
}
