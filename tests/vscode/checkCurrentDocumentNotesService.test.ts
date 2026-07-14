/**
 * Unit tests for checking current VS Code document notes.
 */

import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import type * as vscodeTypes from "vscode";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";

import { createSourceHash } from "@shared/utils/hashUtils";
import { WorkspaceNoteStore, WorkspaceNoteStoreRepository } from "@vscode/notes";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockWorkspaceFolder = {
  uri: vscodeTypes.Uri;
  name: string;
  index: number;
};

const mocks = vi.hoisted(() => ({
  workspaceFolders: [] as MockWorkspaceFolder[],
  configuredRootDirectory: "",
  outputDirectory: ".caca",
}));

vi.mock("vscode", () => ({
  workspace: {
    get workspaceFolders() {
      return mocks.workspaceFolders;
    },

    getConfiguration: () => ({
      get: <T>(key: string, defaultValue: T): T => {
        if (key === "rootDirectory") {
          return mocks.configuredRootDirectory as T;
        }

        if (key === "outputDirectory") {
          return mocks.outputDirectory as T;
        }

        return defaultValue;
      },
    }),

    getWorkspaceFolder: (uri: vscodeTypes.Uri) =>
      mocks.workspaceFolders.find((folder) => {
        const relativePath = path.relative(folder.uri.fsPath, uri.fsPath);
        return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
      }),
  },
}));

import {
  checkCurrentDocumentNotes,
  type CheckCurrentDocumentNotesDocument,
} from "@vscode/services/checkCurrentDocumentNotesService";

const createdAt = "2026-01-01T00:00:00.000Z";
const randomId = "abcdef123456";

describe("checkCurrentDocumentNotes()", () => {
  beforeEach(() => {
    mocks.workspaceFolders.length = 0;
    mocks.configuredRootDirectory = "";
    mocks.outputDirectory = ".caca";
  });

  it("checks the entire current document when changedStartLine is not provided", async () => {
    const workspaceRoot = await createTempWorkspaceRoot();
    const relativeFilePath = "src/index.ts";
    const sourceText = ["const first = 1;", "const second = 2;"].join("\n");
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => randomId));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    await notes.cache.saveSourceFile(
      workspaceRoot,
      mocks.outputDirectory,
      relativeFilePath,
      {
        ...createStoredSourceFile(),
        source: {
          sourceHash: createSourceHash(sourceText),
          programmingLanguage: "typescript",
        },
      },
      createdAt,
    );

    const result = await checkCurrentDocumentNotes({
      document: createDocument(path.join(workspaceRoot, relativeFilePath), sourceText, "typescriptreact"),
      notes,
    });

    expect(result).toMatchObject({
      kind: "tracked",
      relativeFilePath,
      report: {
        file: {
          sourceHashChanged: false,
          programmingLanguageChanged: true,
          previousProgrammingLanguage: "typescript",
          currentProgrammingLanguage: "typescriptreact",
        },
      },
    });
  });

  it("checks only the changed source range when changedStartLine is provided", async () => {
    const workspaceRoot = await createTempWorkspaceRoot();
    const relativeFilePath = "src/index.ts";
    const oldSourceText = [
      "const first = 1;",
      "const second = 2;",
      "const third = first + second;",
      "const fourth = 4;",
    ].join("\n");
    const nextSourceText = [
      "const first = 1;",
      "const second = 2;",
      "const third = 30;",
      "const fourth = 4;",
    ].join("\n");
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => randomId));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    await notes.cache.saveSourceFile(
      workspaceRoot,
      mocks.outputDirectory,
      relativeFilePath,
      createStoredSourceFileWithAnchors(oldSourceText),
      createdAt,
    );

    const result = await checkCurrentDocumentNotes({
      document: createDocument(path.join(workspaceRoot, relativeFilePath), nextSourceText),
      notes,
      changedStartLine: 3,
    });

    expect(result).toMatchObject({
      kind: "tracked",
      relativeFilePath,
      report: {
        file: {
          sourceHashChanged: true,
          programmingLanguageChanged: false,
        },
      },
    });

    if (result.kind !== "tracked") {
      throw new Error("Expected tracked detection result.");
    }

    expect(result.report.lines.map((line) => line.id)).toEqual(["line:3"]);
  });

  it("returns indexEntryMissing when the document has no stored note file", async () => {
    const workspaceRoot = await createTempWorkspaceRoot();
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => randomId));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    const result = await checkCurrentDocumentNotes({
      document: createDocument(path.join(workspaceRoot, "src", "missing.ts"), "const value = 1;"),
      notes,
    });

    expect(result).toEqual({
      kind: "indexEntryMissing",
      relativeFilePath: "src/missing.ts",
    });
  });

  it("throws when the current document is outside the configured CZaza root", async () => {
    const workspaceRoot = await createTempWorkspaceRoot();
    const configuredRoot = path.join(workspaceRoot, "packages", "app");
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => randomId));

    await mkdir(configuredRoot, { recursive: true });
    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    mocks.configuredRootDirectory = "packages/app";

    await expect(
      checkCurrentDocumentNotes({
        document: createDocument(path.join(workspaceRoot, "src", "outside.ts"), "const value = 1;"),
        notes,
      }),
    ).rejects.toThrow("outside the configured CZaza root");
  });

  it("throws when changedStartLine is not a positive one-based line number", async () => {
    const workspaceRoot = await createTempWorkspaceRoot();
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => randomId));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    await expect(
      checkCurrentDocumentNotes({
        document: createDocument(path.join(workspaceRoot, "src", "index.ts"), "const value = 1;"),
        notes,
        changedStartLine: 0,
      }),
    ).rejects.toThrow("changedStartLine must be a positive one-based line number");
  });
});

/**
 * Creates a temporary workspace root for service tests.
 *
 * @returns Temporary workspace root path.
 *
 * @example
 * const root = await createTempWorkspaceRoot();
 */
async function createTempWorkspaceRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "czaza-current-document-"));
}

/**
 * Creates a mock VS Code workspace folder.
 *
 * @param workspaceRoot - Absolute workspace root path.
 * @returns Mock workspace folder.
 *
 * @example
 * const folder = createWorkspaceFolder("/workspace/project");
 */
function createWorkspaceFolder(workspaceRoot: string): MockWorkspaceFolder {
  return {
    uri: createUri(workspaceRoot),
    name: path.basename(workspaceRoot),
    index: mocks.workspaceFolders.length,
  };
}

/**
 * Creates a minimal document-like object for note detection tests.
 *
 * @param fsPath - Absolute file path represented by the document URI.
 * @param sourceText - Full document source text.
 * @param languageId - VS Code language id.
 * @returns Minimal current document shape.
 *
 * @example
 * const document = createDocument("/workspace/project/src/index.ts", "const value = 1;");
 */
function createDocument(
  fsPath: string,
  sourceText: string,
  languageId = "typescript",
): CheckCurrentDocumentNotesDocument {
  return {
    uri: createUri(fsPath),
    languageId,
    getText: () => sourceText,
  };
}

/**
 * Creates the minimum URI shape required by the service tests.
 *
 * @param fsPath - Local file-system path represented by the URI.
 * @returns Mock VS Code file URI.
 *
 * @example
 * const uri = createUri("/workspace/project/src/index.ts");
 */
function createUri(fsPath: string): vscodeTypes.Uri {
  return {
    scheme: "file",
    fsPath,
  } as vscodeTypes.Uri;
}

/**
 * Creates a minimal stored source file.
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
 * Creates a stored source file with line anchors for changed-range tests.
 *
 * @param sourceText - Stored source text used for the file hash.
 * @returns Stored source file fixture.
 *
 * @example
 * const sourceFile = createStoredSourceFileWithAnchors(sourceText);
 */
function createStoredSourceFileWithAnchors(sourceText: string): StoredSourceFile {
  return {
    source: {
      sourceHash: createSourceHash(sourceText),
      programmingLanguage: "typescript",
    },
    sectionNotes: [],
    lineNotes: [
      {
        id: "line:2",
        line: 2,
        anchorText: "const second = 2;",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "ai",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "line:3",
        line: 3,
        anchorText: "const third = first + second;",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "ai",
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };
}
