/**
 * Applies deterministic text document changes to stored file notes.
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
import type { ClassifiedTextDocumentChange } from "./classifyTextDocumentChangeService";

/** Input for applying one deterministic document change. */
export type ApplyDeterministicTextDocumentChangeInput = {
  /** Stored file note bundle before the change. */
  sourceFile: StoredSourceFile;

  /** Classified deterministic text document change. */
  change: ClassifiedTextDocumentChange;

  /** Current source text after the change. */
  currentSourceText: string;

  /** Current VS Code language id, when available. */
  programmingLanguage?: ProgrammingLanguage;

  /** ISO 8601 timestamp used for updatedAt. */
  now: string;
};

/** Event emitted while applying one deterministic change. */
export type DeterministicTextDocumentChangeEvent =
  | {
      type: "unsupportedChange";
      reason: Extract<ClassifiedTextDocumentChange, { kind: "unsupported" }>["reason"];
    }
  | {
      type: "fileNoteMarkedStale";
    }
  | {
      type: "sectionNoteMoved" | "sectionNoteChanged" | "sectionNoteOrphaned";
      sectionId: string;
    }
  | {
      type: "lineNoteMoved" | "lineNoteChanged" | "lineNoteOrphaned";
      lineId: string;
    };

/** Result of applying one deterministic document change. */
export type ApplyDeterministicTextDocumentChangeResult = {
  /** Updated file note bundle. */
  sourceFile: StoredSourceFile;

  /** Whether any stored data changed. */
  changed: boolean;

  /** Structured events describing applied updates. */
  events: DeterministicTextDocumentChangeEvent[];
};

/**
 * Applies a supported deterministic text change to stored file notes.
 *
 * @param input - Stored notes, classified change, current source text, and timestamp.
 * @returns Updated source file and emitted events.
 *
 * @example
 * const result = applyDeterministicTextDocumentChange({ sourceFile, change, currentSourceText, now });
 */
export function applyDeterministicTextDocumentChange(
  input: ApplyDeterministicTextDocumentChangeInput,
): ApplyDeterministicTextDocumentChangeResult {
  if (input.change.kind === "unsupported") {
    return {
      sourceFile: input.sourceFile,
      changed: false,
      events: [
        {
          type: "unsupportedChange",
          reason: input.change.reason,
        },
      ],
    };
  }

  const events: DeterministicTextDocumentChangeEvent[] = [];
  let next = updateSourceHash(input.sourceFile, createSourceHash(input.currentSourceText));

  next = updateProgrammingLanguage(next, input.programmingLanguage);

  if (next.fileNote) {
    next = updateFileNoteStatus(next, { content: "stale", anchor: "confirmed" }, input.now);
    events.push({ type: "fileNoteMarkedStale" });
  }

  if (input.change.kind === "insertLines") {
    next = applyInsertLines(next, input.change.startLine, input.change.lineCount, input.now, events);
  } else if (input.change.kind === "deleteLines") {
    next = applyDeleteLines(
      next,
      input.change.startLine,
      input.change.endLine,
      input.change.lineCount,
      input.now,
      events,
    );
  } else {
    next = applyEditLine(next, input.change.line, input.now, events);
  }

  return {
    sourceFile: next,
    changed: events.length > 0 || next !== input.sourceFile,
    events,
  };
}

function applyInsertLines(
  sourceFile: StoredSourceFile,
  startLine: number,
  lineCount: number,
  now: string,
  events: DeterministicTextDocumentChangeEvent[],
): StoredSourceFile {
  return {
    ...sourceFile,
    sectionNotes: sourceFile.sectionNotes.map((note) => {
      if (startLine < note.range.startLine) {
        events.push({ type: "sectionNoteMoved", sectionId: note.id });
        return {
          ...note,
          range: {
            startLine: note.range.startLine + lineCount,
            endLine: note.range.endLine + lineCount,
          },
          status: confirmAnchor(note.status),
          updatedAt: now,
        };
      }

      if (startLine <= note.range.endLine) {
        const nextRange = {
          startLine: note.range.startLine,
          endLine: note.range.endLine + lineCount,
        };
        events.push({ type: "sectionNoteChanged", sectionId: note.id });
        return {
          ...note,
          range: nextRange,
          status: staleConfirmed,
          updatedAt: now,
        };
      }

      return note;
    }),
    lineNotes: sourceFile.lineNotes.map((note) => {
      if (startLine <= note.line) {
        events.push({ type: "lineNoteMoved", lineId: note.id });
        return {
          ...note,
          line: note.line + lineCount,
          status: confirmAnchor(note.status),
          updatedAt: now,
        };
      }

      return note;
    }),
  };
}

function applyDeleteLines(
  sourceFile: StoredSourceFile,
  startLine: number,
  endLine: number,
  lineCount: number,
  now: string,
  events: DeterministicTextDocumentChangeEvent[],
): StoredSourceFile {
  return {
    ...sourceFile,
    sectionNotes: sourceFile.sectionNotes.map((note) =>
      applyDeleteLinesToSection(note, startLine, endLine, lineCount, now, events),
    ),
    lineNotes: sourceFile.lineNotes.map((note) =>
      applyDeleteLinesToLine(note, startLine, endLine, lineCount, now, events),
    ),
  };
}

function applyDeleteLinesToSection(
  note: StoredSectionNote,
  startLine: number,
  endLine: number,
  lineCount: number,
  now: string,
  events: DeterministicTextDocumentChangeEvent[],
): StoredSectionNote {
  if (endLine < note.range.startLine) {
    events.push({ type: "sectionNoteMoved", sectionId: note.id });
    return {
      ...note,
      range: {
        startLine: note.range.startLine - lineCount,
        endLine: note.range.endLine - lineCount,
      },
      status: confirmAnchor(note.status),
      updatedAt: now,
    };
  }

  if (startLine > note.range.endLine) {
    return note;
  }

  const deletedStart = Math.max(startLine, note.range.startLine);
  const deletedEnd = Math.min(endLine, note.range.endLine);
  const deletedInsideCount = deletedEnd - deletedStart + 1;
  const remainingLineCount = note.range.endLine - note.range.startLine + 1 - deletedInsideCount;

  if (remainingLineCount <= 0) {
    events.push({ type: "sectionNoteOrphaned", sectionId: note.id });
    return {
      ...note,
      status: staleOrphaned,
      updatedAt: now,
    };
  }

  const startShift = startLine < note.range.startLine ? Math.min(lineCount, note.range.startLine - startLine) : 0;
  const nextRange = {
    startLine: note.range.startLine - startShift,
    endLine: note.range.endLine - lineCount,
  };

  events.push({ type: "sectionNoteChanged", sectionId: note.id });
  return {
    ...note,
    range: nextRange,
    status: staleConfirmed,
    updatedAt: now,
  };
}

function applyDeleteLinesToLine(
  note: StoredLineNote,
  startLine: number,
  endLine: number,
  lineCount: number,
  now: string,
  events: DeterministicTextDocumentChangeEvent[],
): StoredLineNote {
  if (endLine < note.line) {
    events.push({ type: "lineNoteMoved", lineId: note.id });
    return {
      ...note,
      line: note.line - lineCount,
      status: confirmAnchor(note.status),
      updatedAt: now,
    };
  }

  if (startLine <= note.line && note.line <= endLine) {
    events.push({ type: "lineNoteOrphaned", lineId: note.id });
    return {
      ...note,
      status: staleOrphaned,
      updatedAt: now,
    };
  }

  return note;
}

function applyEditLine(
  sourceFile: StoredSourceFile,
  line: number,
  now: string,
  events: DeterministicTextDocumentChangeEvent[],
): StoredSourceFile {
  return {
    ...sourceFile,
    sectionNotes: sourceFile.sectionNotes.map((note) => {
      if (note.range.startLine <= line && line <= note.range.endLine) {
        events.push({ type: "sectionNoteChanged", sectionId: note.id });
        return {
          ...note,
          status: staleConfirmed,
          updatedAt: now,
        };
      }

      return note;
    }),
    lineNotes: sourceFile.lineNotes.map((note) => {
      if (note.line === line) {
        events.push({ type: "lineNoteChanged", lineId: note.id });
        return {
          ...note,
          status: staleConfirmed,
          updatedAt: now,
        };
      }

      return note;
    }),
  };
}

const staleConfirmed: NoteStatus = {
  content: "stale",
  anchor: "confirmed",
};

const staleOrphaned: NoteStatus = {
  content: "stale",
  anchor: "orphaned",
};

function confirmAnchor(status: NoteStatus): NoteStatus {
  return {
    content: status.content,
    anchor: "confirmed",
  };
}
