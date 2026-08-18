/**
 * Verifies that user-created Section Notes are stored in the selected Notes space.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import type * as vscodeTypes from "vscode";
import { WorkspaceNoteStore, WorkspaceNoteStoreRepository } from "@vscode/notes";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rootDirectory: "",
  relativePath: "src/index.ts",
  outputDirectory: ".czaza",
}));

vi.mock("vscode", () => ({
  Position: class Position {
    readonly line: number;
    readonly character: number;

    constructor(line: number, character: number) {
      this.line = line;
      this.character = character;
    }
  },
  Range: class Range {
    readonly start: unknown;
    readonly end: unknown;

    constructor(start: unknown, end: unknown) {
      this.start = start;
      this.end = end;
    }
  },
}));

vi.mock("@vscode/config/resolveCzazaRootDirectory", () => ({
  resolveCzazaRootDirectory: () => ({ rootDirectory: mocks.rootDirectory }),
  getCzazaRelativePath: () => mocks.relativePath,
}));

vi.mock("@vscode/config/czazaSettings", () => ({
  getCzazaSettings: () => ({ outputDirectory: mocks.outputDirectory }),
}));

import { createUserSectionNoteService } from "@vscode/services/createUserSectionNoteService";

describe("createUserSectionNoteService()", () => {
  beforeEach(async () => {
    mocks.rootDirectory = await mkdtemp(path.join(tmpdir(), "czaza-create-section-"));
  });

  it("creates a Personal Section Note without changing Team Notes", async () => {
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository());
    const personal = { kind: "personal" as const, memberId: "leo-12345678" };

    await createUserSectionNoteService({
      document: createDocument(),
      notes,
      startLine: 1,
      endLine: 2,
      userNote: "Personal section.",
      location: personal,
    });

    const personalSource = await notes.cache.getSourceFile(
      mocks.rootDirectory,
      mocks.outputDirectory,
      mocks.relativePath,
      personal,
    );
    const teamSource = await notes.cache.getSourceFile(
      mocks.rootDirectory,
      mocks.outputDirectory,
      mocks.relativePath,
    );

    expect(personalSource?.sectionNotes).toHaveLength(1);
    expect(personalSource?.sectionNotes[0]?.range).toEqual({ startLine: 1, endLine: 2 });
    expect(personalSource?.sectionNotes[0]?.userNote).toBe("Personal section.");
    expect(teamSource).toBeUndefined();
  });

  it("keeps creating Section Notes in Team when no location is provided", async () => {
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository());

    await createUserSectionNoteService({
      document: createDocument(),
      notes,
      startLine: 1,
      endLine: 2,
      userNote: "Team section.",
    });

    const teamSource = await notes.cache.getSourceFile(
      mocks.rootDirectory,
      mocks.outputDirectory,
      mocks.relativePath,
    );

    expect(teamSource?.sectionNotes).toHaveLength(1);
  });

  it("does not create storage for an empty Section draft", async () => {
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository());

    const sectionId = await createUserSectionNoteService({
      document: createDocument(),
      notes,
      startLine: 1,
      endLine: 2,
      userNote: "   ",
    });

    expect(sectionId).toBeUndefined();
    expect(await notes.cache.getSourceFile(
      mocks.rootDirectory,
      mocks.outputDirectory,
      mocks.relativePath,
    )).toBeUndefined();
  });
});

/** Creates the minimal text document required by the Section Note service. */
function createDocument(): vscodeTypes.TextDocument {
  const source = "const first = 1;\nreturn first;";
  const lines = source.split("\n");

  return {
    uri: { scheme: "file", fsPath: path.join(mocks.rootDirectory, mocks.relativePath) },
    languageId: "typescript",
    lineCount: lines.length,
    getText: () => source,
    lineAt: (index: number) => ({ text: lines[index] ?? "" }),
  } as vscodeTypes.TextDocument;
}
