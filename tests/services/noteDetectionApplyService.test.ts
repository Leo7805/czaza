/**
 * Unit tests for applying note detection reports to stored notes.
 */

import { describe, expect, it } from "vitest";
import type { FileNotesDetectionReport } from "@shared/services/notes/noteDetectionService";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { applyFileNotesDetectionReport } from "@shared/services/notes/noteDetectionApplyService";

const createdAt = "2026-07-12T00:00:00.000Z";
const now = "2026-07-13T00:00:00.000Z";

describe("noteDetectionApplyService", () => {
  it("applies file, section, and line statuses from a detection report", () => {
    const sourceFile = createStoredSourceFile();
    const report = createDetectionReport();
    const updated = applyFileNotesDetectionReport(sourceFile, report, now);

    expect(updated.fileNote).toMatchObject({
      status: {
        content: "stale",
        anchor: "confirmed",
      },
      updatedAt: now,
    });
    expect(updated.sectionNotes[0]).toMatchObject({
      status: {
        content: "stale",
        anchor: "needsConfirmation",
      },
      updatedAt: now,
    });
    expect(updated.lineNotes[0]).toMatchObject({
      status: {
        content: "stale",
        anchor: "orphaned",
      },
      updatedAt: now,
    });
    expect(updated.sectionNotes[0]?.range).toEqual(sourceFile.sectionNotes[0]?.range);
    expect(updated.sectionNotes[0]?.anchorHash).toBe(sourceFile.sectionNotes[0]?.anchorHash);
    expect(updated.lineNotes[0]?.line).toBe(sourceFile.lineNotes[0]?.line);
    expect(updated.lineNotes[0]?.anchorText).toBe(sourceFile.lineNotes[0]?.anchorText);
    expect(sourceFile.sectionNotes[0]?.status).toEqual({
      content: "current",
      anchor: "confirmed",
    });
  });

  it("updates only section and line notes present in a partial detection report", () => {
    const sourceFile = createStoredSourceFile();
    const report = {
      ...createDetectionReport(),
      sections: [
        {
          ...createDetectionReport().sections[1],
          status: {
            content: "stale" as const,
            anchor: "needsConfirmation" as const,
          },
        },
      ],
      lines: [
        {
          ...createDetectionReport().lines[1],
          status: {
            content: "stale" as const,
            anchor: "needsConfirmation" as const,
          },
        },
      ],
    };
    const updated = applyFileNotesDetectionReport(sourceFile, report, now);

    expect(updated.sectionNotes[0]?.status).toEqual({
      content: "current",
      anchor: "confirmed",
    });
    expect(updated.sectionNotes[1]?.status).toEqual({
      content: "stale",
      anchor: "needsConfirmation",
    });
    expect(updated.lineNotes[0]?.status).toEqual({
      content: "current",
      anchor: "confirmed",
    });
    expect(updated.lineNotes[1]?.status).toEqual({
      content: "stale",
      anchor: "needsConfirmation",
    });
  });

  it("does not clear existing stale or location review statuses when detection matches", () => {
    const sourceFile = createStoredSourceFile();
    sourceFile.fileNote!.status = {
      content: "stale",
      anchor: "confirmed",
    };
    sourceFile.sectionNotes[0]!.status = {
      content: "stale",
      anchor: "confirmed",
    };
    sourceFile.lineNotes[0]!.status = {
      content: "stale",
      anchor: "needsConfirmation",
    };
    const report = {
      ...createDetectionReport(),
      file: {
        ...createDetectionReport().file,
        status: {
          content: "current" as const,
          anchor: "confirmed" as const,
        },
      },
      sections: [
        {
          ...createDetectionReport().sections[0],
          status: {
            content: "current" as const,
            anchor: "confirmed" as const,
          },
        },
      ],
      lines: [
        {
          ...createDetectionReport().lines[0],
          status: {
            content: "current" as const,
            anchor: "confirmed" as const,
          },
        },
      ],
    };
    const updated = applyFileNotesDetectionReport(sourceFile, report, now);

    expect(updated.fileNote?.status).toEqual({
      content: "stale",
      anchor: "confirmed",
    });
    expect(updated.sectionNotes[0]?.status).toEqual({
      content: "stale",
      anchor: "confirmed",
    });
    expect(updated.lineNotes[0]?.status).toEqual({
      content: "stale",
      anchor: "needsConfirmation",
    });
  });

  it("does not create a file note when applying a file detection status", () => {
    const sourceFile = createStoredSourceFile();
    const sourceFileWithoutFileNote = {
      source: sourceFile.source,
      sectionNotes: sourceFile.sectionNotes,
      lineNotes: sourceFile.lineNotes,
    };
    const updated = applyFileNotesDetectionReport(sourceFileWithoutFileNote, createDetectionReport(), now);

    expect(updated.fileNote).toBeUndefined();
  });
});

/**
 * Creates a stored source file with notes at every layer.
 *
 * @returns Stored source file fixture.
 *
 * @example
 * const sourceFile = createStoredSourceFile();
 */
function createStoredSourceFile(): StoredSourceFile {
  return {
    source: {
      sourceHash: "sha256:source",
      programmingLanguage: "typescript",
    },
    fileNote: {
      id: "file",
      userNote: "File note.",
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "user",
      createdAt,
      updatedAt: createdAt,
    },
    sectionNotes: [
      {
        id: "section:1",
        title: "First section",
        range: {
          startLine: 1,
          endLine: 2,
        },
        anchorHash: "sha256:section-1",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "user",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "section:2",
        title: "Second section",
        range: {
          startLine: 3,
          endLine: 4,
        },
        anchorHash: "sha256:section-2",
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
        anchorText: "const first = 1;",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "user",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "line:3",
        line: 3,
        anchorText: "const third = 3;",
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

/**
 * Creates a detection report with suggested stale statuses.
 *
 * @returns Detection report fixture.
 *
 * @example
 * const report = createDetectionReport();
 */
function createDetectionReport(): FileNotesDetectionReport {
  return {
    file: {
      status: {
        content: "stale",
        anchor: "confirmed",
      },
      sourceHashChanged: true,
      reason: "sourceHashChanged",
      previousSourceHash: "sha256:source",
      currentSourceHash: "sha256:current",
      previousProgrammingLanguage: "typescript",
      currentLineCount: 4,
    },
    sections: [
      {
        id: "section:1",
        status: {
          content: "stale",
          anchor: "needsConfirmation",
        },
        reason: "anchorHashChanged",
        range: {
          startLine: 1,
          endLine: 2,
        },
        previousAnchorHash: "sha256:section-1",
        currentAnchorHash: "sha256:section-1-next",
      },
      {
        id: "section:2",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        reason: "anchorHashMatched",
        range: {
          startLine: 3,
          endLine: 4,
        },
        previousAnchorHash: "sha256:section-2",
        currentAnchorHash: "sha256:section-2",
      },
    ],
    lines: [
      {
        id: "line:1",
        status: {
          content: "stale",
          anchor: "orphaned",
        },
        reason: "lineOutOfBounds",
        line: 1,
        previousAnchorText: "const first = 1;",
      },
      {
        id: "line:3",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        reason: "anchorTextMatched",
        line: 3,
        previousAnchorText: "const third = 3;",
        currentAnchorText: "const third = 3;",
      },
    ],
  };
}
