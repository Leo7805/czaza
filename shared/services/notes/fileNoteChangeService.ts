/**
 * Detects and applies file-note changes caused by source-file content and resource updates.
 */

import type { NoteAnchorStatus } from "@shared/models/domain/common";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { updateSourceHash } from "@shared/services/notes/noteAnchorService";

/** Input used to compare stored and current source content hashes. */
export type DetectFileNoteContentChangeInput = {
  /** Source hash stored with the notes before the current change. */
  previousSourceHash: string;

  /** Source hash computed from the current source content. */
  nextSourceHash: string;
};

/** Detection result for source content changes that can affect a file note. */
export type FileNoteContentChangeDetection =
  | {
      /** Source content did not change. */
      kind: "unchanged";
    }
  | {
      /** Source content changed and file-note content may be stale. */
      kind: "changed";

      /** Source hash stored before the current change. */
      previousSourceHash: string;

      /** Source hash computed after the current change. */
      nextSourceHash: string;
    };

/** Event emitted while applying a file-note content detection result. */
export type FileNoteChangeEvent =
  | {
      /** The stored source hash was updated. */
      type: "sourceHashChanged";
      previousSourceHash: string;
      nextSourceHash: string;
    }
  | {
      /** The existing file note was marked content-stale. */
      type: "fileNoteMarkedStale";
      fileNoteId: string;
    }
  | {
      /** A known move or rename was applied by an outer store/index layer. */
      type: "fileNoteResourceMoved";
      previousRelativePath: string;
      nextRelativePath: string;
    }
  | {
      /** The resource was explicitly deleted. */
      type: "fileNoteResourceDeleted";
      relativePath: string;
    }
  | {
      /** The resource was missing during an availability check. */
      type: "fileNoteResourceMissing";
      relativePath: string;
    }
  | {
      /** The file note anchor status changed. */
      type: "fileNoteAnchorChanged";
      fileNoteId: string;
      previousAnchor: NoteAnchorStatus;
      nextAnchor: NoteAnchorStatus;
    };

/** Input used to apply a file-note content change to a stored source file. */
export type ApplyFileNoteContentChangeInput = {
  /** Stored source file to update. */
  sourceFile: StoredSourceFile;

  /** Content change detection result to apply. */
  detection: FileNoteContentChangeDetection;

  /** ISO 8601 timestamp used when updating note metadata. */
  now: string;
};

/** Result of applying a file-note content change. */
export type ApplyFileNoteContentChangeResult = {
  /** Updated source file. */
  sourceFile: StoredSourceFile;

  /** Whether any stored data changed. */
  changed: boolean;

  /** Structured events describing the applied changes. */
  events: FileNoteChangeEvent[];
};

/** Input used to detect whether a resource currently exists. */
export type DetectFileNoteResourceAvailabilityInput = {
  /** CZaza-root-relative path for the resource that owns the note. */
  relativePath: string;

  /** Whether the resource currently exists. */
  exists: boolean;
};

/** Conservative resource availability detection result. */
export type FileNoteResourceAvailabilityDetection =
  | {
      /** The resource is available. */
      kind: "available";
      relativePath: string;
    }
  | {
      /** The resource is missing, but the cause is unknown. */
      kind: "missing";
      relativePath: string;
    };

/** Result of applying a file-note resource change. */
export type ApplyFileNoteResourceChangeResult = {
  /** Updated source file. */
  sourceFile: StoredSourceFile;

  /** Whether any stored data changed. */
  changed: boolean;

  /** Structured events describing the applied changes. */
  events: FileNoteChangeEvent[];
};

/**
 * Detects whether source content changed by comparing source hashes.
 *
 * @param input - Previous and current source hashes.
 * @returns Detection result describing whether the content changed.
 *
 * @example
 * const detection = detectFileNoteContentChange({ previousSourceHash: "a", nextSourceHash: "b" });
 */
export function detectFileNoteContentChange(
  input: DetectFileNoteContentChangeInput,
): FileNoteContentChangeDetection {
  if (input.previousSourceHash === input.nextSourceHash) {
    return { kind: "unchanged" };
  }

  return {
    kind: "changed",
    previousSourceHash: input.previousSourceHash,
    nextSourceHash: input.nextSourceHash,
  };
}

/**
 * Applies a source content change to file-note status and source metadata.
 *
 * Hash changes update the stored source hash. Existing file notes are marked
 * content-stale while preserving their anchor status. Section and line notes are
 * intentionally left untouched.
 *
 * @param input - Stored source file, detection result, and update timestamp.
 * @returns Updated source file plus change events.
 *
 * @example
 * const result = applyFileNoteContentChange({ sourceFile, detection, now });
 */
export function applyFileNoteContentChange(
  input: ApplyFileNoteContentChangeInput,
): ApplyFileNoteContentChangeResult {
  if (input.detection.kind === "unchanged") {
    return {
      sourceFile: input.sourceFile,
      changed: false,
      events: [],
    };
  }

  const events: FileNoteChangeEvent[] = [
    {
      type: "sourceHashChanged",
      previousSourceHash: input.detection.previousSourceHash,
      nextSourceHash: input.detection.nextSourceHash,
    },
  ];
  const sourceFileWithHash = updateSourceHash(input.sourceFile, input.detection.nextSourceHash);

  if (!sourceFileWithHash.fileNote) {
    return {
      sourceFile: sourceFileWithHash,
      changed: true,
      events,
    };
  }

  const shouldMarkStale = sourceFileWithHash.fileNote.status.content !== "stale";

  return {
    sourceFile: {
      ...sourceFileWithHash,
      fileNote: {
        ...sourceFileWithHash.fileNote,
        status: {
          ...sourceFileWithHash.fileNote.status,
          content: "stale",
        },
        updatedAt: shouldMarkStale ? input.now : sourceFileWithHash.fileNote.updatedAt,
      },
    },
    changed: true,
    events: shouldMarkStale
      ? [
          ...events,
          {
            type: "fileNoteMarkedStale",
            fileNoteId: sourceFileWithHash.fileNote.id,
          },
        ]
      : events,
  };
}

/**
 * Detects only whether a file-note resource is currently available.
 *
 * This intentionally does not guess whether a missing resource was renamed,
 * moved, or deleted. Explicit VS Code file events should call the matching
 * apply function directly.
 *
 * @param input - Resource path and existence flag.
 * @returns Conservative availability detection result.
 *
 * @example
 * const detection = detectFileNoteResourceAvailability({ relativePath: "src/a.ts", exists: false });
 */
export function detectFileNoteResourceAvailability(
  input: DetectFileNoteResourceAvailabilityInput,
): FileNoteResourceAvailabilityDetection {
  return input.exists
    ? { kind: "available", relativePath: input.relativePath }
    : { kind: "missing", relativePath: input.relativePath };
}

/**
 * Applies a known file-note resource move or rename.
 *
 * Path/index migration is owned by the caller. This function only confirms the
 * file-note anchor when a note exists.
 *
 * @param input - Stored source file, old/new relative paths, and timestamp.
 * @returns Updated source file plus change events.
 *
 * @example
 * const result = applyFileNoteResourceMoved({ sourceFile, previousRelativePath: "a.ts", nextRelativePath: "b.ts", now });
 */
export function applyFileNoteResourceMoved(input: {
  sourceFile: StoredSourceFile;
  previousRelativePath: string;
  nextRelativePath: string;
  now: string;
}): ApplyFileNoteResourceChangeResult {
  return applyFileNoteAnchorStatus({
    sourceFile: input.sourceFile,
    nextAnchor: "confirmed",
    now: input.now,
    events: [
      {
        type: "fileNoteResourceMoved",
        previousRelativePath: input.previousRelativePath,
        nextRelativePath: input.nextRelativePath,
      },
    ],
  });
}

/**
 * Applies an explicit file-note resource delete.
 *
 * @param input - Stored source file, deleted relative path, and timestamp.
 * @returns Updated source file plus change events.
 *
 * @example
 * const result = applyFileNoteResourceDeleted({ sourceFile, relativePath: "src/a.ts", now });
 */
export function applyFileNoteResourceDeleted(input: {
  sourceFile: StoredSourceFile;
  relativePath: string;
  now: string;
}): ApplyFileNoteResourceChangeResult {
  return applyFileNoteAnchorStatus({
    sourceFile: input.sourceFile,
    nextAnchor: "orphaned",
    now: input.now,
    events: [
      {
        type: "fileNoteResourceDeleted",
        relativePath: input.relativePath,
      },
    ],
  });
}

/**
 * Applies a missing-resource availability check.
 *
 * Missing from a snapshot does not prove deletion, so the anchor moves to
 * needsConfirmation instead of orphaned.
 *
 * @param input - Stored source file, missing relative path, and timestamp.
 * @returns Updated source file plus change events.
 *
 * @example
 * const result = applyFileNoteResourceMissing({ sourceFile, relativePath: "src/a.ts", now });
 */
export function applyFileNoteResourceMissing(input: {
  sourceFile: StoredSourceFile;
  relativePath: string;
  now: string;
}): ApplyFileNoteResourceChangeResult {
  return applyFileNoteAnchorStatus({
    sourceFile: input.sourceFile,
    nextAnchor: "needsConfirmation",
    now: input.now,
    events: [
      {
        type: "fileNoteResourceMissing",
        relativePath: input.relativePath,
      },
    ],
  });
}

function applyFileNoteAnchorStatus(input: {
  sourceFile: StoredSourceFile;
  nextAnchor: NoteAnchorStatus;
  now: string;
  events: FileNoteChangeEvent[];
}): ApplyFileNoteResourceChangeResult {
  const fileNote = input.sourceFile.fileNote;

  if (!fileNote) {
    return {
      sourceFile: input.sourceFile,
      changed: false,
      events: input.events,
    };
  }

  if (fileNote.status.anchor === input.nextAnchor) {
    return {
      sourceFile: input.sourceFile,
      changed: false,
      events: input.events,
    };
  }

  return {
    sourceFile: {
      ...input.sourceFile,
      fileNote: {
        ...fileNote,
        status: {
          ...fileNote.status,
          anchor: input.nextAnchor,
        },
        updatedAt: input.now,
      },
    },
    changed: true,
    events: [
      ...input.events,
      {
        type: "fileNoteAnchorChanged",
        fileNoteId: fileNote.id,
        previousAnchor: fileNote.status.anchor,
        nextAnchor: input.nextAnchor,
      },
    ],
  };
}
