/**
 * Unit tests for unified file, section, and line user-note persistence.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import type * as vscodeTypes from "vscode";
import { createStoredSourceFile } from "@shared/services/domainToStoreService";
import { WorkspaceNoteStore, WorkspaceNoteStoreRepository } from "@vscode/notes";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rootDirectory: "",
  relativePath: "src/index.ts",
  outputDirectory: ".czaza",
  sourceCode: "const first = 1;\nreturn first;",
  languageId: "typescript",
  isDirectory: false,
}));

vi.mock("vscode", () => ({
  FileType: {
    File: 1,
    Directory: 2,
  },
  workspace: {
    fs: {
      stat: vi.fn().mockImplementation(async () => ({
        type: mocks.isDirectory ? 2 : 1,
      })),
    },
    openTextDocument: vi.fn().mockImplementation(async (uri: vscodeTypes.Uri) => {
      const lines = mocks.sourceCode.split(/\r?\n/);

      return {
        uri,
        languageId: mocks.languageId,
        lineCount: lines.length,
        getText: () => mocks.sourceCode,
        lineAt: (index: number) => ({ text: lines[index] ?? "" }),
      };
    }),
  },
}));

vi.mock("@vscode/config/resolveCzazaRootDirectory", () => ({
  resolveCzazaRootDirectory: () => ({ rootDirectory: mocks.rootDirectory }),
  getCzazaRelativePath: () => mocks.relativePath,
}));

vi.mock("@vscode/config/czazaSettings", () => ({
  getCzazaSettings: () => ({ outputDirectory: mocks.outputDirectory }),
}));

import { saveUserNoteService } from "@vscode/services/saveUserNoteService";

const randomId = "abcdef123456";
const createdAt = "2026-01-01T00:00:00.000Z";

describe("saveUserNoteService()", () => {
  beforeEach(async () => {
    mocks.rootDirectory = await mkdtemp(path.join(tmpdir(), "czaza-save-user-note-"));
    mocks.relativePath = "src/index.ts";
    mocks.outputDirectory = ".czaza";
    mocks.sourceCode = "const first = 1;\nreturn first;";
    mocks.languageId = "typescript";
    mocks.isDirectory = false;
  });

  it("initializes source storage and saves a file user note", async () => {
    const notes = createNoteStore();
    const uri = createUri(path.join(mocks.rootDirectory, mocks.relativePath));

    await saveUserNoteService({
      uri,
      notes,
      target: { level: "file" },
      userNote: "  First paragraph.\n\nSecond paragraph.  ",
    });

    const stored = await notes.cache.getRequiredSourceFile(
      mocks.rootDirectory,
      mocks.outputDirectory,
      mocks.relativePath,
    );

    expect(stored.fileNote).toMatchObject({
      id: "file",
      userNote: "  First paragraph.\n\nSecond paragraph.  ",
      createdBy: "user",
      status: { content: "current", anchor: "confirmed" },
    });
    expect(stored.source.programmingLanguage).toBe("typescript");
  });

  it("preserves section AI content and metadata while updating its user note", async () => {
    const notes = createNoteStore();
    const uri = createUri(path.join(mocks.rootDirectory, mocks.relativePath));
    const sourceFile = createStoredSourceFile({
      sourceCode: mocks.sourceCode,
      programmingLanguage: mocks.languageId,
      now: createdAt,
    });
    sourceFile.sectionNotes = [
      {
        id: "section:existing",
        title: "Return value",
        range: { startLine: 2, endLine: 2 },
        anchorHash: "sha256:section",
        aiExplanation: {
          summary: "Returns the value.",
          detail: "Returns the previously declared value.",
        },
        status: { content: "current", anchor: "confirmed" },
        createdBy: "ai",
        createdAt,
        updatedAt: createdAt,
      },
    ];
    await notes.cache.saveSourceFile(
      mocks.rootDirectory,
      mocks.outputDirectory,
      mocks.relativePath,
      sourceFile,
      createdAt,
    );

    await saveUserNoteService({
      uri,
      notes,
      target: { level: "section", sectionId: "section:existing" },
      userNote: "Review this return path.",
    });

    const stored = await notes.cache.getRequiredSourceFile(
      mocks.rootDirectory,
      mocks.outputDirectory,
      mocks.relativePath,
    );
    expect(stored.sectionNotes[0]).toMatchObject({
      id: "section:existing",
      title: "Return value",
      anchorHash: "sha256:section",
      userNote: "Review this return path.",
      createdBy: "ai",
      createdAt,
      aiExplanation: { summary: "Returns the value." },
    });
  });

  it("creates and then clears a user-only line note without removing the node", async () => {
    const notes = createNoteStore();
    const uri = createUri(path.join(mocks.rootDirectory, mocks.relativePath));

    await saveUserNoteService({
      uri,
      notes,
      target: { level: "line", line: 2 },
      userNote: "Check this line.",
    });

    let stored = await notes.cache.getRequiredSourceFile(
      mocks.rootDirectory,
      mocks.outputDirectory,
      mocks.relativePath,
    );
    expect(stored.lineNotes[0]).toMatchObject({
      id: "line:2",
      line: 2,
      anchorText: "return first;",
      userNote: "Check this line.",
      createdBy: "user",
    });

    await saveUserNoteService({
      uri,
      notes,
      target: { level: "line", line: 2 },
      userNote: "   ",
    });

    stored = await notes.cache.getRequiredSourceFile(
      mocks.rootDirectory,
      mocks.outputDirectory,
      mocks.relativePath,
    );
    expect(stored.lineNotes).toHaveLength(1);
    expect(stored.lineNotes[0]).toMatchObject({
      id: "line:2",
      line: 2,
      anchorText: "return first;",
      createdBy: "user",
    });
    expect(stored.lineNotes[0]?.userNote).toBeUndefined();
  });

  it("clears a user-only file note without removing the node", async () => {
    const notes = createNoteStore();
    const uri = createUri(path.join(mocks.rootDirectory, mocks.relativePath));

    await saveUserNoteService({
      uri,
      notes,
      target: { level: "file" },
      userNote: "Keep the file node.",
    });

    await saveUserNoteService({
      uri,
      notes,
      target: { level: "file" },
      userNote: "   ",
    });

    const stored = await notes.cache.getRequiredSourceFile(
      mocks.rootDirectory,
      mocks.outputDirectory,
      mocks.relativePath,
    );
    expect(stored.fileNote).toMatchObject({
      id: "file",
      createdBy: "user",
      status: { content: "current", anchor: "confirmed" },
    });
    expect(stored.fileNote?.userNote).toBeUndefined();
  });

  it("initializes and saves a complete directory file note without opening a document", async () => {
    const notes = createNoteStore();
    mocks.relativePath = "src/components";
    mocks.isDirectory = true;
    const uri = createUri(path.join(mocks.rootDirectory, mocks.relativePath));

    await saveUserNoteService({
      uri,
      notes,
      target: { level: "file" },
      userNote: "Directory note.\nSecond line.",
    });

    const stored = await notes.cache.getRequiredSourceFile(
      mocks.rootDirectory,
      mocks.outputDirectory,
      mocks.relativePath,
    );
    expect(stored.fileNote).toMatchObject({
      id: "file",
      userNote: "Directory note.\nSecond line.",
      createdBy: "user",
    });
    expect(stored.source.programmingLanguage).toBeUndefined();
  });
});

function createNoteStore(): WorkspaceNoteStore {
  return new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => randomId));
}

function createUri(fsPath: string): vscodeTypes.Uri {
  return {
    scheme: "file",
    fsPath,
    path: fsPath,
    toString: () => `file://${fsPath}`,
  } as vscodeTypes.Uri;
}
