/**
 * Applies normalized source splices to stored Note anchors and statuses.
 */

import type { NoteStatus } from "@shared/models/domain/common";
import type { StoredLineNote } from "@shared/models/store/line";
import type { StoredSectionNote } from "@shared/models/store/section";
import type { ProgrammingLanguage, StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  updateProgrammingLanguage,
  updateSourceHash,
} from "@shared/services/notes/noteAnchorService";
import { updateFileNoteStatus } from "@shared/services/notes/noteStatusService";
import { createSourceHash } from "@shared/utils/hashUtils";
import type { ClassifiedSourceChange } from "./classifySourceChangeService";
import {
  transformLineAnchor,
  transformSectionAnchor,
  type LineAnchorTransform,
  type SectionAnchorTransform,
  type SourceChangeSplice,
} from "./sourceChangeAnchorTransform";

/** Input for applying one normalized document change. */
export type ApplyDeterministicRelocationInput = {
  /** Stored file note bundle before the change. */
  sourceFile: StoredSourceFile;
  /** Classified source change. */
  change: ClassifiedSourceChange;
  /** Current source text after the change. */
  currentSourceText: string;
  /** Current VS Code language id, when available. */
  programmingLanguage?: ProgrammingLanguage;
  /** ISO 8601 timestamp used for updatedAt. */
  now: string;
};

/** Event emitted while applying one normalized source change. */
export type DeterministicRelocationEvent =
  | {
      type: "unsupportedChange";
      reason: Extract<ClassifiedSourceChange, { kind: "unsupported" }>["reason"];
    }
  | { type: "fileNoteMarkedStale" }
  | {
      type:
        | "sectionNoteMoved"
        | "sectionNoteChanged"
        | "sectionNoteNeedsConfirmation"
        | "sectionNoteOrphaned";
      sectionId: string;
    }
  | {
      type: "lineNoteMoved" | "lineNoteChanged" | "lineNoteNeedsConfirmation" | "lineNoteOrphaned";
      lineId: string;
    };

/** Result of applying one normalized source change. */
export type ApplyDeterministicRelocationResult = {
  /** Updated file note bundle. */
  sourceFile: StoredSourceFile;
  /** Whether any stored data changed. */
  changed: boolean;
  /** Structured events describing applied updates. */
  events: DeterministicRelocationEvent[];
};

/** Result of applying one splice only to Section and Line Note anchors. */
export type ApplySourceSpliceToAnchorsResult = {
  /** Source bundle containing updated Section and Line Note anchors. */
  sourceFile: StoredSourceFile;
  /** Relocation events emitted for affected anchors. */
  events: DeterministicRelocationEvent[];
};

/**
 * Applies one supported source splice to stored File, Section, and Line Notes.
 *
 * @param input - Stored notes, classified change, current source text, and timestamp.
 * @returns Updated source file and emitted relocation events.
 */
export function applyDeterministicRelocation(
  input: ApplyDeterministicRelocationInput,
): ApplyDeterministicRelocationResult {
  if (input.change.kind === "unsupported") {
    return {
      sourceFile: input.sourceFile,
      changed: false,
      events: [{ type: "unsupportedChange", reason: input.change.reason }],
    };
  }

  const splice = input.change.splice;
  const events: DeterministicRelocationEvent[] = [];
  let next = updateSourceHash(input.sourceFile, createSourceHash(input.currentSourceText));
  next = updateProgrammingLanguage(next, input.programmingLanguage);

  if (next.fileNote) {
    next = updateFileNoteStatus(next, staleConfirmed, input.now);
    events.push({ type: "fileNoteMarkedStale" });
  }

  const anchorResult = applySourceSpliceToAnchors(next, splice, input.now);
  next = anchorResult.sourceFile;
  events.push(...anchorResult.events);

  return {
    sourceFile: next,
    changed: next !== input.sourceFile || events.length > 0,
    events,
  };
}

/**
 * Applies one splice to Section and Line anchors without updating file metadata.
 *
 * @param sourceFile - Stored source bundle before the splice.
 * @param splice - Normalized source splice to apply.
 * @param now - Timestamp assigned to affected Notes.
 * @returns Updated anchors and their relocation events.
 */
export function applySourceSpliceToAnchors(
  sourceFile: StoredSourceFile,
  splice: SourceChangeSplice,
  now: string,
): ApplySourceSpliceToAnchorsResult {
  const events: DeterministicRelocationEvent[] = [];

  return {
    sourceFile: {
      ...sourceFile,
      sectionNotes: sourceFile.sectionNotes.map((note) =>
        applySectionTransform(note, transformSectionAnchor(note.range, splice), now, events),
      ),
      lineNotes: sourceFile.lineNotes.map((note) =>
        applyLineTransform(note, transformLineAnchor(note.line, splice), now, events),
      ),
    },
    events,
  };
}

/**
 * Applies one pure Section anchor transformation to a stored Section Note.
 *
 * @param note - Section Note before relocation.
 * @param transform - Calculated anchor transformation.
 * @param now - Timestamp assigned when the note changes.
 * @param events - Mutable event collection for the relocation.
 * @returns Original or updated Section Note.
 */
function applySectionTransform(
  note: StoredSectionNote,
  transform: SectionAnchorTransform,
  now: string,
  events: DeterministicRelocationEvent[],
): StoredSectionNote {
  if (transform.kind === "unchanged") {
    return note;
  }

  if (transform.kind === "moved") {
    events.push({ type: "sectionNoteMoved", sectionId: note.id });
    return {
      ...note,
      range: transform.range,
      status: confirmAnchor(note.status),
      updatedAt: now,
    };
  }

  if (transform.kind === "changed") {
    events.push({ type: "sectionNoteChanged", sectionId: note.id });
    return { ...note, range: transform.range, status: staleConfirmed, updatedAt: now };
  }

  if (transform.kind === "needsConfirmation") {
    events.push({ type: "sectionNoteNeedsConfirmation", sectionId: note.id });
    return { ...note, status: staleNeedsConfirmation, updatedAt: now };
  }

  events.push({ type: "sectionNoteOrphaned", sectionId: note.id });
  return { ...note, status: staleOrphaned, updatedAt: now };
}

/**
 * Applies one pure Line anchor transformation to a stored Line Note.
 *
 * @param note - Line Note before relocation.
 * @param transform - Calculated anchor transformation.
 * @param now - Timestamp assigned when the note changes.
 * @param events - Mutable event collection for the relocation.
 * @returns Original or updated Line Note.
 */
function applyLineTransform(
  note: StoredLineNote,
  transform: LineAnchorTransform,
  now: string,
  events: DeterministicRelocationEvent[],
): StoredLineNote {
  if (transform.kind === "unchanged") {
    return note;
  }

  if (transform.kind === "moved") {
    events.push({ type: "lineNoteMoved", lineId: note.id });
    return {
      ...note,
      line: transform.line,
      status: confirmAnchor(note.status),
      updatedAt: now,
    };
  }

  if (transform.kind === "changed") {
    events.push({ type: "lineNoteChanged", lineId: note.id });
    return { ...note, line: transform.line, status: staleConfirmed, updatedAt: now };
  }

  if (transform.kind === "needsConfirmation") {
    events.push({ type: "lineNoteNeedsConfirmation", lineId: note.id });
    return { ...note, status: staleNeedsConfirmation, updatedAt: now };
  }

  events.push({ type: "lineNoteOrphaned", lineId: note.id });
  return { ...note, status: staleOrphaned, updatedAt: now };
}

const staleConfirmed: NoteStatus = { content: "stale", anchor: "confirmed" };
const staleNeedsConfirmation: NoteStatus = {
  content: "stale",
  anchor: "needsConfirmation",
};
const staleOrphaned: NoteStatus = { content: "stale", anchor: "orphaned" };

/**
 * Preserves content status while confirming a deterministically moved anchor.
 *
 * @param status - Existing note status.
 * @returns Status with a confirmed anchor.
 */
function confirmAnchor(status: NoteStatus): NoteStatus {
  return { content: status.content, anchor: "confirmed" };
}
