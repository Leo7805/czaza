/**
 * Applies session-only Runtime Note statuses to Navigator payloads.
 */

import type {
  NavigatorNotesResult,
} from "@vscode/services/getNavigatorNotesService";

import type {
  RuntimeNoteState,
  RuntimeNoteTargetChange,
} from "./runtimeNoteState";

/**
 * Merges Runtime status into Navigator items without changing visible locations.
 *
 * @param payload - Persistent Navigator payload.
 * @param states - Runtime states in the current workspace Note Store scope.
 * @returns Original payload when no overlay applies, otherwise a merged copy.
 */
export function applyRuntimeStateToNavigatorNotes(
  payload: NavigatorNotesResult,
  states: readonly RuntimeNoteState[],
): NavigatorNotesResult {
  if (payload.kind !== "resource" || states.length === 0) {
    return payload;
  }

  const statesByPath = new Map(states.map((state) => [state.relativePath, state]));
  const files = payload.files.map((file) => {
    const change = statesByPath
      .get(file.relativePath)
      ?.targetChanges.find((target) => target.kind === "file");

    return change
      ? {
          ...file,
          status: { ...change.status },
          runtimeStatus: { ...change.status },
        }
      : file;
  });
  const currentState = payload.currentFile
    ? statesByPath.get(payload.currentFile)
    : undefined;

  if (!currentState) {
    return { ...payload, files };
  }

  const sectionChanges = createTargetChangeMap(currentState.targetChanges, "section");
  const lineChanges = createTargetChangeMap(currentState.targetChanges, "line");

  return {
    ...payload,
    files,
    sections: payload.sections.map((section) => {
      const change = sectionChanges.get(section.id);
      return change
        ? {
            ...section,
            status: { ...change.status },
            runtimeStatus: { ...change.status },
          }
        : section;
    }),
    lines: payload.lines.map((line) => {
      const change = lineChanges.get(line.id);
      return change
        ? {
            ...line,
            status: { ...change.status },
            runtimeStatus: { ...change.status },
          }
        : line;
    }),
  };
}

/**
 * Indexes Section or Line Runtime targets by stable Note id.
 *
 * @param changes - Runtime targets for one resource.
 * @param kind - Target kind to include.
 * @returns Matching targets keyed by Note id.
 */
function createTargetChangeMap(
  changes: readonly RuntimeNoteTargetChange[],
  kind: "section" | "line",
): Map<string, Extract<RuntimeNoteTargetChange, { kind: "section" | "line" }>> {
  return new Map(
    changes
      .filter(
        (
          change,
        ): change is Extract<
          RuntimeNoteTargetChange,
          { kind: "section" | "line" }
        > => change.kind === kind,
      )
      .map((change) => [change.noteId, change]),
  );
}
