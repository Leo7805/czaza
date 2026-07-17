/**
 * Unit tests for file-note content change detection and updates.
 */

import { describe, expect, it } from "vitest";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  applyFileNoteResourceDeleted,
  applyFileNoteResourceMissing,
  applyFileNoteResourceMoved,
  applyFileNoteContentChange,
  detectFileNoteContentChange,
  detectFileNoteResourceAvailability,
} from "@shared/services/notes/fileNoteChangeService";

const createdAt = "2026-07-12T00:00:00.000Z";
const now = "2026-07-13T00:00:00.000Z";

describe("fileNoteChangeService", () => {
  it("detects unchanged and changed source hashes", () => {
    expect(
      detectFileNoteContentChange({
        previousSourceHash: "sha256:old",
        nextSourceHash: "sha256:old",
      }),
    ).toEqual({ kind: "unchanged" });

    expect(
      detectFileNoteContentChange({
        previousSourceHash: "sha256:old",
        nextSourceHash: "sha256:new",
      }),
    ).toEqual({
      kind: "changed",
      previousSourceHash: "sha256:old",
      nextSourceHash: "sha256:new",
    });
  });

  it("does not change the source file when content is unchanged", () => {
    const sourceFile = createStoredSourceFile();
    const result = applyFileNoteContentChange({
      sourceFile,
      detection: { kind: "unchanged" },
      now,
    });

    expect(result).toEqual({
      sourceFile,
      changed: false,
      events: [],
    });
  });

  it("updates source hash without creating a missing file note", () => {
    const sourceFile = {
      ...createStoredSourceFile(),
      fileNote: undefined,
    };
    const result = applyFileNoteContentChange({
      sourceFile,
      detection: {
        kind: "changed",
        previousSourceHash: "sha256:old",
        nextSourceHash: "sha256:new",
      },
      now,
    });

    expect(result.sourceFile.source.sourceHash).toBe("sha256:new");
    expect(result.sourceFile.fileNote).toBeUndefined();
    expect(result.changed).toBe(true);
    expect(result.events).toEqual([
      {
        type: "sourceHashChanged",
        previousSourceHash: "sha256:old",
        nextSourceHash: "sha256:new",
      },
    ]);
  });

  it("marks an existing file note stale while preserving its anchor status", () => {
    const sourceFile = createStoredSourceFile();
    const result = applyFileNoteContentChange({
      sourceFile,
      detection: {
        kind: "changed",
        previousSourceHash: "sha256:old",
        nextSourceHash: "sha256:new",
      },
      now,
    });

    expect(result.sourceFile.source.sourceHash).toBe("sha256:new");
    expect(result.sourceFile.fileNote).toMatchObject({
      id: "file",
      status: {
        content: "stale",
        anchor: "needsConfirmation",
      },
      createdAt,
      updatedAt: now,
    });
    expect(result.events).toEqual([
      {
        type: "sourceHashChanged",
        previousSourceHash: "sha256:old",
        nextSourceHash: "sha256:new",
      },
      {
        type: "fileNoteMarkedStale",
        fileNoteId: "file",
      },
    ]);
  });

  it("does not update file note timestamp or emit stale event when it is already stale", () => {
    const sourceFile = {
      ...createStoredSourceFile(),
      fileNote: {
        ...createStoredSourceFile().fileNote!,
        status: {
          content: "stale" as const,
          anchor: "confirmed" as const,
        },
      },
    };
    const result = applyFileNoteContentChange({
      sourceFile,
      detection: {
        kind: "changed",
        previousSourceHash: "sha256:old",
        nextSourceHash: "sha256:new",
      },
      now,
    });

    expect(result.sourceFile.fileNote).toMatchObject({
      status: {
        content: "stale",
        anchor: "confirmed",
      },
      updatedAt: createdAt,
    });
    expect(result.events).toEqual([
      {
        type: "sourceHashChanged",
        previousSourceHash: "sha256:old",
        nextSourceHash: "sha256:new",
      },
    ]);
  });

  it("does not change section or line notes", () => {
    const sourceFile = createStoredSourceFile();
    const result = applyFileNoteContentChange({
      sourceFile,
      detection: {
        kind: "changed",
        previousSourceHash: "sha256:old",
        nextSourceHash: "sha256:new",
      },
      now,
    });

    expect(result.sourceFile.sectionNotes).toBe(sourceFile.sectionNotes);
    expect(result.sourceFile.lineNotes).toBe(sourceFile.lineNotes);
  });

  it("detects resource availability without guessing why a resource is missing", () => {
    expect(
      detectFileNoteResourceAvailability({
        relativePath: "src/index.ts",
        exists: true,
      }),
    ).toEqual({
      kind: "available",
      relativePath: "src/index.ts",
    });

    expect(
      detectFileNoteResourceAvailability({
        relativePath: "src/index.ts",
        exists: false,
      }),
    ).toEqual({
      kind: "missing",
      relativePath: "src/index.ts",
    });
  });

  it("confirms the file note anchor after a known move", () => {
    const sourceFile = createStoredSourceFile();
    const result = applyFileNoteResourceMoved({
      sourceFile,
      previousRelativePath: "src/old.ts",
      nextRelativePath: "src/new.ts",
      now,
    });

    expect(result.changed).toBe(true);
    expect(result.sourceFile.fileNote).toMatchObject({
      status: {
        content: "current",
        anchor: "confirmed",
      },
      updatedAt: now,
    });
    expect(result.events).toEqual([
      {
        type: "fileNoteResourceMoved",
        previousRelativePath: "src/old.ts",
        nextRelativePath: "src/new.ts",
      },
      {
        type: "fileNoteAnchorChanged",
        fileNoteId: "file",
        previousAnchor: "needsConfirmation",
        nextAnchor: "confirmed",
      },
    ]);
  });

  it("marks the file note anchor orphaned after an explicit delete", () => {
    const sourceFile = createStoredSourceFile();
    const result = applyFileNoteResourceDeleted({
      sourceFile,
      relativePath: "src/index.ts",
      now,
    });

    expect(result.changed).toBe(true);
    expect(result.sourceFile.fileNote).toMatchObject({
      status: {
        content: "current",
        anchor: "orphaned",
      },
      updatedAt: now,
    });
    expect(result.events).toEqual([
      {
        type: "fileNoteResourceDeleted",
        relativePath: "src/index.ts",
      },
      {
        type: "fileNoteAnchorChanged",
        fileNoteId: "file",
        previousAnchor: "needsConfirmation",
        nextAnchor: "orphaned",
      },
    ]);
  });

  it("marks the file note anchor needsConfirmation when a resource is missing for an unknown reason", () => {
    const sourceFile = {
      ...createStoredSourceFile(),
      fileNote: {
        ...createStoredSourceFile().fileNote!,
        status: {
          content: "current" as const,
          anchor: "confirmed" as const,
        },
      },
    };
    const result = applyFileNoteResourceMissing({
      sourceFile,
      relativePath: "src/index.ts",
      now,
    });

    expect(result.changed).toBe(true);
    expect(result.sourceFile.fileNote).toMatchObject({
      status: {
        content: "current",
        anchor: "needsConfirmation",
      },
      updatedAt: now,
    });
    expect(result.events).toEqual([
      {
        type: "fileNoteResourceMissing",
        relativePath: "src/index.ts",
      },
      {
        type: "fileNoteAnchorChanged",
        fileNoteId: "file",
        previousAnchor: "confirmed",
        nextAnchor: "needsConfirmation",
      },
    ]);
  });

  it("does not create a file note for resource updates", () => {
    const sourceFile = {
      ...createStoredSourceFile(),
      fileNote: undefined,
    };
    const result = applyFileNoteResourceDeleted({
      sourceFile,
      relativePath: "src/index.ts",
      now,
    });

    expect(result.changed).toBe(false);
    expect(result.sourceFile.fileNote).toBeUndefined();
    expect(result.events).toEqual([
      {
        type: "fileNoteResourceDeleted",
        relativePath: "src/index.ts",
      },
    ]);
  });
});

function createStoredSourceFile(): StoredSourceFile {
  return {
    source: {
      sourceHash: "sha256:old",
      programmingLanguage: "typescript",
    },
    fileNote: {
      id: "file",
      userNote: "File note.",
      status: {
        content: "current",
        anchor: "needsConfirmation",
      },
      createdBy: "user",
      createdAt,
      updatedAt: createdAt,
    },
    sectionNotes: [
      {
        id: "section:1:intro:1-2",
        title: "Intro",
        range: {
          startLine: 1,
          endLine: 2,
        },
        anchorHash: "sha256:section",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "user",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    lineNotes: [
      {
        id: "line:1",
        line: 1,
        anchorText: "const value = 1;",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "user",
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };
}
