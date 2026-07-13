/**
 * Unit tests for stored source-file note CRUD helpers.
 */

import { describe, expect, it } from "vitest";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  deleteFileNote,
  deleteLineNote,
  deleteSectionNote,
  getFileNote,
  getLineNote,
  getSectionNote,
  upsertFileNote,
  upsertLineNote,
  upsertSectionNote,
} from "@shared/services/notes/sourceFileNoteCrudService";

const createdAt = "2026-07-12T00:00:00.000Z";
const now = "2026-07-13T00:00:00.000Z";

describe("sourceFileNoteCrudService", () => {
  it("inserts, reads, updates, and deletes a file note", () => {
    const sourceFile = createStoredSourceFile();
    const withFileNote = upsertFileNote(sourceFile, createFileNoteInput("Initial file note."), createdAt);

    expect(sourceFile.fileNote).toBeUndefined();
    expect(getFileNote(withFileNote)).toEqual({
      id: "file",
      userNote: "Initial file note.",
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "user",
      createdAt,
      updatedAt: createdAt,
    });

    const updated = upsertFileNote(withFileNote, createFileNoteInput("Updated file note."), now);

    expect(updated.fileNote?.createdAt).toBe(createdAt);
    expect(updated.fileNote?.updatedAt).toBe(now);
    expect(updated.fileNote?.userNote).toBe("Updated file note.");
    expect(deleteFileNote(updated).fileNote).toBeUndefined();
  });

  it("inserts and updates section notes while preserving createdAt and sorting by range", () => {
    const sourceFile = createStoredSourceFile();
    const secondSection = createSectionNoteInput("section:2:second:5-8", "Second", 5, 8);
    const firstSection = createSectionNoteInput("section:1:first:1-3", "First", 1, 3);
    const withSecond = upsertSectionNote(sourceFile, secondSection, createdAt);
    const withBoth = upsertSectionNote(withSecond, firstSection, createdAt);

    expect(withBoth.sectionNotes.map((note) => note.id)).toEqual([
      "section:1:first:1-3",
      "section:2:second:5-8",
    ]);
    expect(getSectionNote(withBoth, "section:2:second:5-8")?.createdAt).toBe(createdAt);

    const updated = upsertSectionNote(
      withBoth,
      {
        ...secondSection,
        userNote: "Updated section note.",
      },
      now,
    );

    expect(getSectionNote(updated, "section:2:second:5-8")).toMatchObject({
      userNote: "Updated section note.",
      createdAt,
      updatedAt: now,
    });
    expect(deleteSectionNote(updated, "section:1:first:1-3").sectionNotes.map((note) => note.id)).toEqual([
      "section:2:second:5-8",
    ]);
  });

  it("inserts and updates line notes while preserving createdAt and sorting by line", () => {
    const sourceFile = createStoredSourceFile();
    const secondLine = createLineNoteInput("line:2", 2, "const second = 2;");
    const firstLine = createLineNoteInput("line:1", 1, "const first = 1;");
    const withSecond = upsertLineNote(sourceFile, secondLine, createdAt);
    const withBoth = upsertLineNote(withSecond, firstLine, createdAt);

    expect(withBoth.lineNotes.map((note) => note.id)).toEqual(["line:1", "line:2"]);
    expect(getLineNote(withBoth, "line:2")?.anchorText).toBe("const second = 2;");

    const updated = upsertLineNote(
      withBoth,
      {
        ...secondLine,
        userNote: "Updated line note.",
      },
      now,
    );

    expect(getLineNote(updated, "line:2")).toMatchObject({
      userNote: "Updated line note.",
      createdAt,
      updatedAt: now,
    });
    expect(deleteLineNote(updated, "line:1").lineNotes.map((note) => note.id)).toEqual(["line:2"]);
  });
});

/**
 * Creates a minimal stored source file for CRUD tests.
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
    sectionNotes: [],
    lineNotes: [],
  };
}

/**
 * Creates a file note upsert fixture.
 *
 * @param userNote - User note text.
 * @returns File note input before timestamps are applied.
 *
 * @example
 * const note = createFileNoteInput("Important file.");
 */
function createFileNoteInput(userNote: string) {
  return {
    id: "file",
    userNote,
    status: {
      content: "current" as const,
      anchor: "confirmed" as const,
    },
    createdBy: "user" as const,
  };
}

/**
 * Creates a section note upsert fixture.
 *
 * @param id - Stable section note id.
 * @param title - Section title.
 * @param startLine - One-based inclusive start line.
 * @param endLine - One-based inclusive end line.
 * @returns Section note input before timestamps are applied.
 *
 * @example
 * const note = createSectionNoteInput("section:1:intro:1-3", "Intro", 1, 3);
 */
function createSectionNoteInput(id: string, title: string, startLine: number, endLine: number) {
  return {
    id,
    title,
    range: {
      startLine,
      endLine,
    },
    anchorHash: `sha256:${id}`,
    status: {
      content: "current" as const,
      anchor: "confirmed" as const,
    },
    createdBy: "user" as const,
  };
}

/**
 * Creates a line note upsert fixture.
 *
 * @param id - Stable line note id.
 * @param line - One-based line number.
 * @param anchorText - Source text captured for the line anchor.
 * @returns Line note input before timestamps are applied.
 *
 * @example
 * const note = createLineNoteInput("line:1", 1, "const value = 1;");
 */
function createLineNoteInput(id: string, line: number, anchorText: string) {
  return {
    id,
    line,
    anchorText,
    status: {
      content: "current" as const,
      anchor: "confirmed" as const,
    },
    createdBy: "user" as const,
  };
}
