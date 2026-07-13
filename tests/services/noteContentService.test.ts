/**
 * Unit tests for stored note content updates.
 */

import { describe, expect, it } from "vitest";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import {
  updateFileAiExplanation,
  updateFileUserNote,
  updateLineAiExplanation,
  updateLineUserNote,
  updateSectionAiExplanation,
  updateSectionKind,
  updateSectionTitle,
  updateSectionUserNote,
} from "@shared/services/notes/noteContentService";

const createdAt = "2026-07-12T00:00:00.000Z";
const now = "2026-07-13T00:00:00.000Z";

describe("noteContentService", () => {
  it("updates file, section, and line user notes without changing status or anchors", () => {
    const sourceFile = createStoredSourceFile();
    const withFile = updateFileUserNote(sourceFile, "Updated file note.", now);
    const withSection = updateSectionUserNote(
      withFile,
      "section:1:intro:1-2",
      "Updated section note.",
      now,
    );
    const withLine = updateLineUserNote(withSection, "line:1", "Updated line note.", now);

    expect(withLine.fileNote).toMatchObject({
      userNote: "Updated file note.",
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdAt,
      updatedAt: now,
    });
    expect(withLine.sectionNotes[0]).toMatchObject({
      userNote: "Updated section note.",
      anchorHash: "sha256:section",
      createdAt,
      updatedAt: now,
    });
    expect(withLine.lineNotes[0]).toMatchObject({
      userNote: "Updated line note.",
      anchorText: "const value = 1;",
      createdAt,
      updatedAt: now,
    });
    expect(sourceFile.fileNote?.userNote).toBe("Initial file note.");
  });

  it("removes user notes when undefined is passed", () => {
    const sourceFile = createStoredSourceFile();
    const withoutFile = updateFileUserNote(sourceFile, undefined, now);
    const withoutSection = updateSectionUserNote(withoutFile, "section:1:intro:1-2", undefined, now);
    const withoutLine = updateLineUserNote(withoutSection, "line:1", undefined, now);

    expect(withoutLine.fileNote?.userNote).toBeUndefined();
    expect(withoutLine.sectionNotes[0]?.userNote).toBeUndefined();
    expect(withoutLine.lineNotes[0]?.userNote).toBeUndefined();
    expect(withoutLine.fileNote?.updatedAt).toBe(now);
    expect(withoutLine.sectionNotes[0]?.updatedAt).toBe(now);
    expect(withoutLine.lineNotes[0]?.updatedAt).toBe(now);
  });

  it("does not create a missing file note when updating file user note", () => {
    const sourceFile = createStoredSourceFile();
    const withoutFileNote = {
      source: sourceFile.source,
      sectionNotes: sourceFile.sectionNotes,
      lineNotes: sourceFile.lineNotes,
    };

    expect(updateFileUserNote(withoutFileNote, "New note.", now).fileNote).toBeUndefined();
  });

  it("leaves non-matching section and line notes unchanged", () => {
    const sourceFile = createStoredSourceFile();
    const withMissingSection = updateSectionUserNote(sourceFile, "missing", "Ignored.", now);
    const withMissingLine = updateLineUserNote(withMissingSection, "missing", "Ignored.", now);

    expect(withMissingLine).toEqual(sourceFile);
  });

  it("updates file, section, and line AI explanations without changing user notes", () => {
    const sourceFile = createStoredSourceFile();
    const fileExplanation = {
      summary: "Updated file AI summary.",
      detail: "Updated file AI detail.",
    };
    const sectionExplanation = {
      summary: "Updated section AI summary.",
      detail: "Updated section AI detail.",
    };
    const lineExplanation = {
      summary: "Updated line AI summary.",
      detail: "Updated line AI detail.",
    };
    const withFile = updateFileAiExplanation(sourceFile, fileExplanation, now);
    const withSection = updateSectionAiExplanation(
      withFile,
      "section:1:intro:1-2",
      sectionExplanation,
      now,
    );
    const withLine = updateLineAiExplanation(withSection, "line:1", lineExplanation, now);

    expect(withLine.fileNote).toMatchObject({
      aiExplanation: fileExplanation,
      userNote: "Initial file note.",
      createdAt,
      updatedAt: now,
    });
    expect(withLine.sectionNotes[0]).toMatchObject({
      aiExplanation: sectionExplanation,
      userNote: "Initial section note.",
      createdAt,
      updatedAt: now,
    });
    expect(withLine.lineNotes[0]).toMatchObject({
      aiExplanation: lineExplanation,
      userNote: "Initial line note.",
      createdAt,
      updatedAt: now,
    });
  });

  it("removes AI explanations when undefined is passed", () => {
    const sourceFile = createStoredSourceFile();
    const withoutFile = updateFileAiExplanation(sourceFile, undefined, now);
    const withoutSection = updateSectionAiExplanation(withoutFile, "section:1:intro:1-2", undefined, now);
    const withoutLine = updateLineAiExplanation(withoutSection, "line:1", undefined, now);

    expect(withoutLine.fileNote?.aiExplanation).toBeUndefined();
    expect(withoutLine.sectionNotes[0]?.aiExplanation).toBeUndefined();
    expect(withoutLine.lineNotes[0]?.aiExplanation).toBeUndefined();
    expect(withoutLine.fileNote?.updatedAt).toBe(now);
    expect(withoutLine.sectionNotes[0]?.updatedAt).toBe(now);
    expect(withoutLine.lineNotes[0]?.updatedAt).toBe(now);
  });

  it("updates section title and kind without changing anchor or note content", () => {
    const sourceFile = createStoredSourceFile();
    const withTitle = updateSectionTitle(sourceFile, "section:1:intro:1-2", "Updated title", now);
    const withKind = updateSectionKind(withTitle, "section:1:intro:1-2", "updated-kind", now);

    expect(withKind.sectionNotes[0]).toMatchObject({
      title: "Updated title",
      kind: "updated-kind",
      anchorHash: "sha256:section",
      userNote: "Initial section note.",
      aiExplanation: {
        summary: "Initial section AI summary.",
        detail: "Initial section AI detail.",
      },
      createdAt,
      updatedAt: now,
    });
    expect(sourceFile.sectionNotes[0]?.title).toBe("Intro");
  });

  it("removes section kind when undefined is passed", () => {
    const sourceFile = createStoredSourceFile();
    const withoutKind = updateSectionKind(sourceFile, "section:1:intro:1-2", undefined, now);

    expect(withoutKind.sectionNotes[0]?.kind).toBeUndefined();
    expect(withoutKind.sectionNotes[0]?.updatedAt).toBe(now);
  });
});

/**
 * Creates a stored source file with user notes at every note layer.
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
      userNote: "Initial file note.",
      aiExplanation: {
        summary: "Initial file AI summary.",
        detail: "Initial file AI detail.",
      },
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
        kind: "setup",
        range: {
          startLine: 1,
          endLine: 2,
        },
        anchorHash: "sha256:section",
        userNote: "Initial section note.",
        aiExplanation: {
          summary: "Initial section AI summary.",
          detail: "Initial section AI detail.",
        },
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
        userNote: "Initial line note.",
        aiExplanation: {
          summary: "Initial line AI summary.",
          detail: "Initial line AI detail.",
        },
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
