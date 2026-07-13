/**
 * Unit tests for domain-to-store note conversion.
 */

import { describe, expect, it } from "vitest";
import type { FileNote } from "@shared/models/domain/file";
import type { LineNote } from "@shared/models/domain/line";
import type { SectionNote } from "@shared/models/domain/section";
import {
  createStoredFileNote,
  createStoredLineNote,
  createStoredSectionNote,
  createStoredSourceFile,
  createWorkspaceNoteIndex,
} from "@shared/services/domainToStoreService";
import { createSourceHash } from "@shared/utils/hashUtils";

const now = "2026-07-13T00:00:00.000Z";

describe("domainToStoreService", () => {
  it("adds store timestamps to a file note", () => {
    const note: FileNote = {
      id: "file",
      aiExplanation: {
        summary: "Defines settings.",
        detail: "Reads settings from VS Code.",
      },
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "ai",
    };

    expect(createStoredFileNote(note, now)).toEqual({
      ...note,
      createdAt: now,
      updatedAt: now,
    });
  });

  it("adds store timestamps to a section note", () => {
    const note: SectionNote = {
      id: "section:1:settings:1-3",
      title: "Settings",
      range: {
        startLine: 1,
        endLine: 3,
      },
      anchorHash: "sha256:section",
      userNote: "Important setup.",
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "user",
    };

    expect(createStoredSectionNote(note, now)).toEqual({
      ...note,
      createdAt: now,
      updatedAt: now,
    });
  });

  it("adds store timestamps to a line note", () => {
    const note: LineNote = {
      id: "line:2",
      line: 2,
      anchorText: "return value;",
      userNote: "Return point.",
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "user",
    };

    expect(createStoredLineNote(note, now)).toEqual({
      ...note,
      createdAt: now,
      updatedAt: now,
    });
  });

  it("creates a stored source file with source hash, language, and sorted notes", () => {
    const sourceCode = "const first = 1;\nconst second = 2;";
    const fileNote: FileNote = {
      id: "file",
      aiExplanation: {
        summary: "Defines two constants.",
        detail: "The file declares two numeric constants used by the tests.",
      },
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "ai",
    };
    const firstSection: SectionNote = {
      id: "section:1:first:1-1",
      title: "First",
      range: {
        startLine: 1,
        endLine: 1,
      },
      anchorHash: "sha256:first",
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "ai",
    };
    const secondSection: SectionNote = {
      id: "section:2:second:2-2",
      title: "Second",
      range: {
        startLine: 2,
        endLine: 2,
      },
      anchorHash: "sha256:second",
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "ai",
    };
    const firstLine: LineNote = {
      id: "line:1",
      line: 1,
      anchorText: "const first = 1;",
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "ai",
    };
    const secondLine: LineNote = {
      id: "line:2",
      line: 2,
      anchorText: "const second = 2;",
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "ai",
    };

    const stored = createStoredSourceFile({
      sourceCode,
      programmingLanguage: "typescript",
      fileNote,
      sectionNotes: [secondSection, firstSection],
      lineNotes: [secondLine, firstLine],
      now,
    });

    console.log("Stored source file:", JSON.stringify(stored, null, 2));

    expect(stored).toEqual({
      source: {
        sourceHash: createSourceHash(sourceCode),
        programmingLanguage: "typescript",
      },
      fileNote: {
        ...fileNote,
        createdAt: now,
        updatedAt: now,
      },
      sectionNotes: [
        {
          ...firstSection,
          createdAt: now,
          updatedAt: now,
        },
        {
          ...secondSection,
          createdAt: now,
          updatedAt: now,
        },
      ],
      lineNotes: [
        {
          ...firstLine,
          createdAt: now,
          updatedAt: now,
        },
        {
          ...secondLine,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
  });

  it("creates empty note arrays when a source file has no notes", () => {
    expect(createStoredSourceFile({ sourceCode: "", now })).toEqual({
      source: {
        sourceHash: createSourceHash(""),
      },
      sectionNotes: [],
      lineNotes: [],
    });
  });

  it("creates a workspace note index with schema metadata", () => {
    const index = createWorkspaceNoteIndex({
      files: {
        "src/index.ts": {
          noteFile: "files/abc123.json",
          sourceHash: "sha256:abc123",
          programmingLanguage: "typescript",
          updatedAt: now,
        },
      },
      workspaceRoot: "/workspace/project",
      now,
    });

    console.log("Workspace note index:", JSON.stringify(index, null, 2));

    expect(index).toEqual({
      schemaVersion: 1,
      updatedAt: now,
      workspaceRoot: "/workspace/project",
      files: {
        "src/index.ts": {
          noteFile: "files/abc123.json",
          sourceHash: "sha256:abc123",
          programmingLanguage: "typescript",
          updatedAt: now,
        },
      },
    });
  });
});
