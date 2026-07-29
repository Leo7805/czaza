/**
 * Applies session-only Runtime Note overlays to a detailed resource payload.
 */

import type { ResourceNotesResult } from "@vscode/services/getResourceNotesService";

import type {
  RuntimeLineNoteChange,
  RuntimeNoteState,
  RuntimeNoteTargetChange,
  RuntimeSectionNoteChange,
} from "./runtimeNoteState";

/**
 * Creates a File Notes payload with matching Runtime State overlays.
 *
 * @param payload - Persistent resource Notes payload.
 * @param state - Optional session-only state for the same source resource.
 * @returns Original payload when no overlay applies, otherwise a merged copy.
 *
 * @example
 * const visible = applyRuntimeStateToResourceNotes(payload, runtimeState);
 */
export function applyRuntimeStateToResourceNotes(
  payload: ResourceNotesResult,
  state: RuntimeNoteState | undefined,
): ResourceNotesResult {
  if (
    payload.kind !== "file" ||
    !state ||
    payload.relativePath !== state.relativePath
  ) {
    return payload;
  }

  const fileChange = state.targetChanges.find(
    (change) => change.kind === "file",
  );
  const sectionChanges = createTargetChangeMap(state.targetChanges, "section");
  const lineChanges = createTargetChangeMap(state.targetChanges, "line");
  const fileNote =
    payload.fileNote && fileChange
      ? {
          ...payload.fileNote,
          status: { ...fileChange.status },
        }
      : payload.fileNote;
  const sectionNotes = payload.sectionNotes.map((section) => {
    const change = sectionChanges.get(section.id);

    if (!change || change.kind !== "section") {
      return section;
    }

    return {
      ...section,
      status: { ...change.status },
      ...(change.range
        ? {
            startLine: change.range.startLine,
            endLine: change.range.endLine,
          }
        : {}),
    };
  });
  const lineChange = payload.lineNote
    ? lineChanges.get(payload.lineNote.id)
    : undefined;
  const lineNote =
    payload.lineNote && lineChange?.kind === "line"
      ? {
          ...payload.lineNote,
          status: { ...lineChange.status },
          ...(lineChange.line ? { line: lineChange.line } : {}),
        }
      : payload.lineNote;

  return {
    ...payload,
    ...(fileNote ? { fileNote } : {}),
    sectionNotes,
    ...(lineNote ? { lineNote } : {}),
  };
}

/**
 * Indexes target changes of one kind by stable Note id.
 *
 * @param changes - Runtime target changes for one resource.
 * @param kind - Section or Line target kind to index.
 * @returns Target changes keyed by Note id.
 */
function createTargetChangeMap(
  changes: readonly RuntimeNoteTargetChange[],
  kind: "section",
): Map<string, RuntimeSectionNoteChange>;
function createTargetChangeMap(
  changes: readonly RuntimeNoteTargetChange[],
  kind: "line",
): Map<string, RuntimeLineNoteChange>;
function createTargetChangeMap(
  changes: readonly RuntimeNoteTargetChange[],
  kind: "section" | "line",
): Map<string, RuntimeSectionNoteChange | RuntimeLineNoteChange> {
  return new Map(
    changes
      .filter(
        (
          change,
        ): change is RuntimeSectionNoteChange | RuntimeLineNoteChange =>
          change.kind === kind,
      )
      .map((change) => [change.noteId, change]),
  );
}
