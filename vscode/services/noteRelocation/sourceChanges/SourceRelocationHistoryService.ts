/**
 * Stores hash-validated in-memory history for reversible source relocations.
 */

import type { NoteStatus } from "@shared/models/domain/common";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";

type SectionHistoryState = {
  id: string;
  range: { startLine: number; endLine: number };
  status: NoteStatus;
};

type LineHistoryState = {
  id: string;
  line: number;
  status: NoteStatus;
};

type RelocationHistorySnapshot = {
  sourceHash: string;
  fileNoteStatus?: NoteStatus;
  sections: SectionHistoryState[];
  lines: LineHistoryState[];
};

type RelocationHistoryEntry = {
  id: number;
  before: RelocationHistorySnapshot;
  after: RelocationHistorySnapshot;
};

type ResourceHistory = {
  undo: RelocationHistoryEntry[];
  redo: RelocationHistoryEntry[];
};

/** Prepared history restoration that must be committed after persistence. */
export type PreparedRelocationHistoryRestore =
  | {
      kind: "ready";
      entryId: number;
      sourceFile: StoredSourceFile;
    }
  | {
      kind: "unavailable" | "mismatch";
    };

/**
 * Owns bounded per-resource relocation Undo and Redo stacks for one extension session.
 *
 * The service never reads or writes files. Callers prepare a hash-validated
 * restoration, persist it, and commit the stack movement only after success.
 *
 * @example
 * const history = new SourceRelocationHistoryService();
 * history.record(uri.toString(), before, after);
 */
export class SourceRelocationHistoryService {
  private readonly resources = new Map<string, ResourceHistory>();
  private readonly maxEntriesPerResource: number;
  private nextEntryId = 1;

  /**
   * Creates a bounded in-memory relocation history.
   *
   * @param maxEntriesPerResource - Maximum Undo entries retained for one resource.
   */
  constructor(maxEntriesPerResource = 100) {
    this.maxEntriesPerResource = maxEntriesPerResource;
  }

  /**
   * Records one successfully persisted deterministic relocation.
   *
   * @param resourceKey - Stable URI string for the source document.
   * @param before - Persistent source Notes before relocation.
   * @param after - Persistent source Notes after relocation.
   * @returns Nothing.
   */
  record(
    resourceKey: string,
    before: StoredSourceFile,
    after: StoredSourceFile,
  ): void {
    const history = this.getOrCreateHistory(resourceKey);

    history.undo.push({
      id: this.nextEntryId,
      before: createSnapshot(before),
      after: createSnapshot(after),
    });
    this.nextEntryId += 1;

    if (history.undo.length > this.maxEntriesPerResource) {
      history.undo.splice(0, history.undo.length - this.maxEntriesPerResource);
    }

    history.redo.length = 0;
  }

  /**
   * Prepares an Undo restoration when persistent and document hashes match history.
   *
   * @param resourceKey - Stable URI string for the source document.
   * @param current - Currently persisted source Notes.
   * @param documentSourceHash - Hash of the document after VS Code applied Undo.
   * @returns Prepared restoration, unavailable history, or a cleared mismatch.
   */
  prepareUndo(
    resourceKey: string,
    current: StoredSourceFile,
    documentSourceHash: string,
  ): PreparedRelocationHistoryRestore {
    return this.prepare(
      resourceKey,
      current,
      documentSourceHash,
      "undo",
    );
  }

  /**
   * Prepares a Redo restoration when persistent and document hashes match history.
   *
   * @param resourceKey - Stable URI string for the source document.
   * @param current - Currently persisted source Notes.
   * @param documentSourceHash - Hash of the document after VS Code applied Redo.
   * @returns Prepared restoration, unavailable history, or a cleared mismatch.
   */
  prepareRedo(
    resourceKey: string,
    current: StoredSourceFile,
    documentSourceHash: string,
  ): PreparedRelocationHistoryRestore {
    return this.prepare(
      resourceKey,
      current,
      documentSourceHash,
      "redo",
    );
  }

  /**
   * Commits one prepared Undo after its restored Notes were persisted.
   *
   * @param resourceKey - Stable URI string for the source document.
   * @param entryId - Prepared history entry identifier.
   * @returns True when the matching stack entry moved to Redo.
   */
  commitUndo(resourceKey: string, entryId: number): boolean {
    return this.commit(resourceKey, entryId, "undo");
  }

  /**
   * Commits one prepared Redo after its restored Notes were persisted.
   *
   * @param resourceKey - Stable URI string for the source document.
   * @param entryId - Prepared history entry identifier.
   * @returns True when the matching stack entry moved to Undo.
   */
  commitRedo(resourceKey: string, entryId: number): boolean {
    return this.commit(resourceKey, entryId, "redo");
  }

  /**
   * Clears history for one source resource.
   *
   * @param resourceKey - Stable URI string for the source document.
   * @returns Whether history existed.
   */
  clear(resourceKey: string): boolean {
    return this.resources.delete(resourceKey);
  }

  /**
   * Clears every source resource history in the current session.
   *
   * @returns Number of resource histories removed.
   */
  clearAll(): number {
    const size = this.resources.size;
    this.resources.clear();
    return size;
  }

  /**
   * Prepares one direction without mutating its stacks.
   *
   * @param resourceKey - Stable URI string for the source document.
   * @param current - Currently persisted source Notes.
   * @param documentSourceHash - Current document hash after history navigation.
   * @param direction - Undo or Redo stack direction.
   * @returns Prepared restoration or rejection.
   */
  private prepare(
    resourceKey: string,
    current: StoredSourceFile,
    documentSourceHash: string,
    direction: "undo" | "redo",
  ): PreparedRelocationHistoryRestore {
    const history = this.resources.get(resourceKey);
    const entry = history?.[direction].at(-1);

    if (!entry) {
      return { kind: "unavailable" };
    }

    const persistedHash =
      direction === "undo" ? entry.after.sourceHash : entry.before.sourceHash;
    const documentHash =
      direction === "undo" ? entry.before.sourceHash : entry.after.sourceHash;

    if (
      current.source.sourceHash !== persistedHash ||
      documentSourceHash !== documentHash
    ) {
      this.clear(resourceKey);
      return { kind: "mismatch" };
    }

    return {
      kind: "ready",
      entryId: entry.id,
      sourceFile: applySnapshot(
        current,
        direction === "undo" ? entry.before : entry.after,
      ),
    };
  }

  /**
   * Moves one prepared entry between Undo and Redo stacks.
   *
   * @param resourceKey - Stable URI string for the source document.
   * @param entryId - Prepared history entry identifier.
   * @param direction - Undo or Redo stack direction.
   * @returns True when the matching stack entry was committed.
   */
  private commit(
    resourceKey: string,
    entryId: number,
    direction: "undo" | "redo",
  ): boolean {
    const history = this.resources.get(resourceKey);
    const source = history?.[direction];
    const entry = source?.at(-1);

    if (!history || !source || !entry || entry.id !== entryId) {
      return false;
    }

    source.pop();
    history[direction === "undo" ? "redo" : "undo"].push(entry);
    return true;
  }

  /**
   * Reads or creates the stacks for one resource.
   *
   * @param resourceKey - Stable URI string for the source document.
   * @returns Mutable resource history owned by this service.
   */
  private getOrCreateHistory(resourceKey: string): ResourceHistory {
    const existing = this.resources.get(resourceKey);

    if (existing) {
      return existing;
    }

    const created = { undo: [], redo: [] };
    this.resources.set(resourceKey, created);
    return created;
  }
}

/**
 * Captures only source-relocation-owned fields from persistent Notes.
 *
 * @param sourceFile - Persistent source Notes to project.
 * @returns Immutable relocation snapshot.
 */
function createSnapshot(sourceFile: StoredSourceFile): RelocationHistorySnapshot {
  return {
    sourceHash: sourceFile.source.sourceHash,
    ...(sourceFile.fileNote
      ? { fileNoteStatus: { ...sourceFile.fileNote.status } }
      : {}),
    sections: sourceFile.sectionNotes.map(({ id, range, status }) => ({
      id,
      range: { ...range },
      status: { ...status },
    })),
    lines: sourceFile.lineNotes.map(({ id, line, status }) => ({
      id,
      line,
      status: { ...status },
    })),
  };
}

/**
 * Restores relocation-owned fields while preserving all user-authored Note content.
 *
 * @param sourceFile - Current persistent source Notes.
 * @param snapshot - Hash, positions, and statuses to restore.
 * @returns Source Notes with only relocation-owned fields replaced.
 */
function applySnapshot(
  sourceFile: StoredSourceFile,
  snapshot: RelocationHistorySnapshot,
): StoredSourceFile {
  const sections = new Map(snapshot.sections.map((section) => [section.id, section]));
  const lines = new Map(snapshot.lines.map((line) => [line.id, line]));

  return {
    ...sourceFile,
    source: { ...sourceFile.source, sourceHash: snapshot.sourceHash },
    fileNote:
      sourceFile.fileNote && snapshot.fileNoteStatus
        ? {
            ...sourceFile.fileNote,
            status: { ...snapshot.fileNoteStatus },
          }
        : sourceFile.fileNote,
    sectionNotes: sourceFile.sectionNotes.map((note) => {
      const restored = sections.get(note.id);
      return restored
        ? {
            ...note,
            range: { ...restored.range },
            status: { ...restored.status },
          }
        : note;
    }),
    lineNotes: sourceFile.lineNotes.map((note) => {
      const restored = lines.get(note.id);
      return restored
        ? {
            ...note,
            line: restored.line,
            status: { ...restored.status },
          }
        : note;
    }),
  };
}
