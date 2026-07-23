/**
 * Atomically applies one classified source-change batch to stored Notes.
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
import {
  applySourceSpliceToAnchors,
  type DeterministicRelocationEvent,
} from "./applyDeterministicRelocationService";
import type { ClassifiedSourceChangeBatch } from "./classifySourceChangeService";
import type { SourceChangeSplice } from "./sourceChangeAnchorTransform";

/** Input for atomically applying one classified source-change batch. */
export type ApplySourceChangeBatchInput = {
  /** Stored source bundle before the complete VS Code event. */
  sourceFile: StoredSourceFile;
  /** Classified and ordered source-change batch. */
  batch: ClassifiedSourceChangeBatch;
  /** Current source text after every splice in the batch. */
  currentSourceText: string;
  /** Current VS Code language id, when available. */
  programmingLanguage?: ProgrammingLanguage;
  /** ISO timestamp shared by every update in the batch. */
  now: string;
};

/** Result of atomically applying one source-change batch. */
export type ApplySourceChangeBatchResult = {
  /** Original or updated source bundle. */
  sourceFile: StoredSourceFile;
  /** Whether persisted source data changed. */
  changed: boolean;
  /** Deduplicated events emitted by the complete batch. */
  events: DeterministicRelocationEvent[];
  /** Unsupported reason when the batch was rejected. */
  unsupportedReason?: Extract<
    ClassifiedSourceChangeBatch,
    { kind: "unsupported" }
  >["reason"];
};

/** One application splice and whether it combines ambiguous same-position insertions. */
type BatchApplicationSplice = {
  splice: SourceChangeSplice;
  requiresConfirmation: boolean;
};

/**
 * Applies an ordered splice batch and updates file metadata exactly once.
 *
 * @param input - Stored Notes, classified batch, final source text, and timestamp.
 * @returns Updated source bundle and deduplicated relocation events.
 */
export function applySourceChangeBatch(
  input: ApplySourceChangeBatchInput,
): ApplySourceChangeBatchResult {
  if (input.batch.kind === "unsupported") {
    return {
      sourceFile: input.sourceFile,
      changed: false,
      events: [],
      unsupportedReason: input.batch.reason,
    };
  }

  let next = input.sourceFile;
  const events: DeterministicRelocationEvent[] = [];

  for (const item of combineSamePositionInsertions(input.batch.splices)) {
    const result = applySourceSpliceToAnchors(next, item.splice, input.now);
    const confirmedResult = item.requiresConfirmation
      ? requireConfirmationForAffectedAnchors(
          result.sourceFile,
          result.events,
          input.now,
        )
      : result;
    next = confirmedResult.sourceFile;
    events.push(...confirmedResult.events);
  }

  next = updateSourceHash(next, createSourceHash(input.currentSourceText));
  next = updateProgrammingLanguage(next, input.programmingLanguage);

  if (next.fileNote) {
    next = updateFileNoteStatus(next, staleConfirmed, input.now);
    events.push({ type: "fileNoteMarkedStale" });
  }

  return {
    sourceFile: next,
    changed: next !== input.sourceFile,
    events: deduplicateRelocationEvents(events),
  };
}

/**
 * Combines same-position insertions so their shared pre-change coordinate is applied once.
 *
 * @param splices - Ordered non-overlapping source splices.
 * @returns Splices with identical insertion positions merged by line count.
 */
function combineSamePositionInsertions(
  splices: readonly SourceChangeSplice[],
): BatchApplicationSplice[] {
  const combined: BatchApplicationSplice[] = [];

  for (const splice of splices) {
    const previous = combined.at(-1);

    if (previous && areSamePositionInsertions(previous.splice, splice)) {
      previous.splice.insertedLineCount += splice.insertedLineCount;
      previous.splice.lineDelta += splice.lineDelta;
      previous.requiresConfirmation = true;
      continue;
    }

    combined.push({
      splice: { ...splice },
      requiresConfirmation: false,
    });
  }

  return combined;
}

/**
 * Marks anchors touched by an ambiguous combined insertion for location review.
 *
 * @param sourceFile - Source bundle after applying the combined insertion.
 * @param events - Anchor events emitted by the combined insertion.
 * @param now - Timestamp assigned to affected Notes.
 * @returns Source bundle and normalized confirmation events.
 */
function requireConfirmationForAffectedAnchors(
  sourceFile: StoredSourceFile,
  events: readonly DeterministicRelocationEvent[],
  now: string,
): {
  sourceFile: StoredSourceFile;
  events: DeterministicRelocationEvent[];
} {
  const sectionIds = new Set(
    events.flatMap((event) => ("sectionId" in event ? [event.sectionId] : [])),
  );
  const lineIds = new Set(
    events.flatMap((event) => ("lineId" in event ? [event.lineId] : [])),
  );

  return {
    sourceFile: {
      ...sourceFile,
      sectionNotes: sourceFile.sectionNotes.map((note) =>
        sectionIds.has(note.id) ? requireSectionConfirmation(note, now) : note,
      ),
      lineNotes: sourceFile.lineNotes.map((note) =>
        lineIds.has(note.id) ? requireLineConfirmation(note, now) : note,
      ),
    },
    events: events.map((event) => {
      if ("sectionId" in event) {
        return { type: "sectionNoteNeedsConfirmation", sectionId: event.sectionId };
      }

      if ("lineId" in event) {
        return { type: "lineNoteNeedsConfirmation", lineId: event.lineId };
      }

      return event;
    }),
  };
}

/**
 * Marks one affected Section Note as requiring anchor confirmation.
 *
 * @param note - Section Note affected by an ambiguous insertion.
 * @param now - Timestamp assigned to the Note.
 * @returns Section Note requiring location review.
 */
function requireSectionConfirmation(
  note: StoredSectionNote,
  now: string,
): StoredSectionNote {
  return {
    ...note,
    status: { content: note.status.content, anchor: "needsConfirmation" },
    updatedAt: now,
  };
}

/**
 * Marks one affected Line Note as requiring anchor confirmation.
 *
 * @param note - Line Note affected by an ambiguous insertion.
 * @param now - Timestamp assigned to the Note.
 * @returns Line Note requiring location review.
 */
function requireLineConfirmation(note: StoredLineNote, now: string): StoredLineNote {
  return {
    ...note,
    status: { content: note.status.content, anchor: "needsConfirmation" },
    updatedAt: now,
  };
}

/**
 * Checks whether two splices are insertions at the same source position.
 *
 * @param left - First normalized source splice.
 * @param right - Second normalized source splice.
 * @returns True when both insertions share their complete empty range.
 */
function areSamePositionInsertions(
  left: SourceChangeSplice,
  right: SourceChangeSplice,
): boolean {
  return (
    left.startLine === left.endLine &&
    right.startLine === right.endLine &&
    left.startLine === right.startLine &&
    left.startCharacter === left.endCharacter &&
    right.startCharacter === right.endCharacter &&
    left.startCharacter === right.startCharacter
  );
}

/**
 * Removes duplicate events emitted when several splices affect the same Note similarly.
 *
 * @param events - Relocation events emitted while applying the batch.
 * @returns Events retaining their first occurrence order.
 */
function deduplicateRelocationEvents(
  events: readonly DeterministicRelocationEvent[],
): DeterministicRelocationEvent[] {
  const seen = new Set<string>();

  return events.filter((event) => {
    const key = JSON.stringify(event);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

const staleConfirmed: NoteStatus = {
  content: "stale",
  anchor: "confirmed",
};
