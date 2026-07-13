/**
 * Unit tests for stored note status updates.
 */

import { describe, expect, it } from "vitest";
import type { NoteStatus } from "@shared/models/domain/common";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  markSourceFileNotesCurrentConfirmed,
  markSourceFileNotesStale,
  updateFileNoteStatus,
  updateLineNoteStatus,
  updateSectionNoteStatus,
} from "@shared/services/notes/noteStatusService";

const createdAt = "2026-07-12T00:00:00.000Z";
const now = "2026-07-13T00:00:00.000Z";

describe("noteStatusService", () => {
  it("updates file, section, and line status without changing createdAt", () => {
    const sourceFile = createStoredSourceFile();
    const stale: NoteStatus = {
      content: "stale",
      anchor: "needsConfirmation",
    };
    const withFile = updateFileNoteStatus(sourceFile, stale, now);
    const withSection = updateSectionNoteStatus(withFile, "section:1:intro:1-2", stale, now);
    const withLine = updateLineNoteStatus(withSection, "line:1", stale, now);

    expect(withLine.fileNote).toMatchObject({ status: stale, createdAt, updatedAt: now });
    expect(withLine.sectionNotes[0]).toMatchObject({ status: stale, createdAt, updatedAt: now });
    expect(withLine.lineNotes[0]).toMatchObject({ status: stale, createdAt, updatedAt: now });
    expect(sourceFile.fileNote?.status.content).toBe("current");
  });

  it("marks every note stale while preserving anchor status", () => {
    const sourceFile = createStoredSourceFile();
    const stale = markSourceFileNotesStale(sourceFile, now);

    expect(stale.fileNote?.status).toEqual({ content: "stale", anchor: "confirmed" });
    expect(stale.sectionNotes[0]?.status).toEqual({ content: "stale", anchor: "confirmed" });
    expect(stale.lineNotes[0]?.status).toEqual({ content: "stale", anchor: "confirmed" });
  });

  it("marks every note current and confirmed", () => {
    const sourceFile = markSourceFileNotesStale(createStoredSourceFile(), now);
    const current = markSourceFileNotesCurrentConfirmed(sourceFile, now);

    expect(current.fileNote?.status).toEqual({ content: "current", anchor: "confirmed" });
    expect(current.sectionNotes[0]?.status).toEqual({ content: "current", anchor: "confirmed" });
    expect(current.lineNotes[0]?.status).toEqual({ content: "current", anchor: "confirmed" });
  });

  it("does not create a file note when updating missing file note status", () => {
    const sourceFile = createStoredSourceFile();
    const withoutFileNote = {
      source: sourceFile.source,
      sectionNotes: sourceFile.sectionNotes,
      lineNotes: sourceFile.lineNotes,
    };

    expect(updateFileNoteStatus(withoutFileNote, { content: "stale", anchor: "confirmed" }, now).fileNote)
      .toBeUndefined();
  });
});

/**
 * Creates a stored source file with one note at every layer.
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
