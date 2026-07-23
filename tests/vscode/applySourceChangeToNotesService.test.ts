/**
 * Unit tests for applying classified text document changes to stored notes.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { createSourceHash } from "@shared/utils/hashUtils";

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

import { applySourceChangeToNotesService } from "@vscode/services/noteRelocation/sourceChanges/applySourceChangeToNotesService";
import type { WorkspaceNoteStore } from "@vscode/notes";

describe("applySourceChangeToNotesService()", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.workspaceFolders.length = 0;
    mocks.configuredRootDirectory = "";
    mocks.outputDirectory = ".caca";
  });

  it("saves deterministic text document changes", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("deterministic");
    const previousText = "export const value = 1;\n";
    const nextText = "export const value = 2;\n";
    const notes = createNotes(createStoredSourceFile(previousText));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    const result = await applySourceChangeToNotesService({
      document: createDocument(path.join(workspaceRoot, "src/index.ts"), nextText),
      change: {
        kind: "editLine",
        line: 1,
      },
      notes: notes.value,
      now: "2026-07-18T00:00:00.000Z",
    });

    expect(result.kind).toBe("updated");
    expect(notes.saveSourceFile).toHaveBeenCalledWith(
      workspaceRoot,
      ".caca",
      "src/index.ts",
      expect.objectContaining({
        source: {
          sourceHash: createSourceHash(nextText),
          programmingLanguage: "typescript",
        },
      }),
      "2026-07-18T00:00:00.000Z",
    );
  });

  it("does not save unsupported changes", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("unsupported");
    const notes = createNotes(createStoredSourceFile("export const value = 1;\n"));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    const result = await applySourceChangeToNotesService({
      document: createDocument(path.join(workspaceRoot, "src/index.ts"), "export const value = 2;\n"),
      change: {
        kind: "unsupported",
        reason: "mixedChange",
      },
      notes: notes.value,
      now: "2026-07-18T00:00:00.000Z",
    });

    expect(result).toEqual({
      kind: "unsupported",
      reason: "mixedChange",
    });
    expect(notes.saveSourceFile).not.toHaveBeenCalled();
  });

  it("does not save untracked files", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("untracked");
    const notes = createNotes(undefined);

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    const result = await applySourceChangeToNotesService({
      document: createDocument(path.join(workspaceRoot, "src/index.ts"), "export const value = 2;\n"),
      change: {
        kind: "editLine",
        line: 1,
      },
      notes: notes.value,
      now: "2026-07-18T00:00:00.000Z",
    });

    expect(result).toEqual({
      kind: "untracked",
      relativePath: "src/index.ts",
    });
    expect(notes.saveSourceFile).not.toHaveBeenCalled();
  });
});

function createNotes(sourceFile: StoredSourceFile | undefined): {
  value: WorkspaceNoteStore;
  saveSourceFile: ReturnType<typeof vi.fn>;
} {
  const saveSourceFile = vi.fn().mockResolvedValue(undefined);

  return {
    value: {
      cache: {
        getSourceFile: vi.fn().mockResolvedValue(sourceFile),
        saveSourceFile,
      },
    } as unknown as WorkspaceNoteStore,
    saveSourceFile,
  };
}

function createStoredSourceFile(sourceText: string): StoredSourceFile {
  const firstLine = sourceText.split(/\r?\n/)[0] ?? "";

  return {
    source: {
      sourceHash: createSourceHash(sourceText),
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
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
    },
    sectionNotes: [
      {
        id: "section:1",
        title: "Export value",
        range: {
          startLine: 1,
          endLine: 1,
        },
        anchorHash: createSourceHash(firstLine),
        userNote: "Section note.",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "user",
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
      },
    ],
    lineNotes: [
      {
        id: "line:1",
        line: 1,
        anchorText: firstLine,
        userNote: "Line note.",
        status: {
          content: "current",
          anchor: "confirmed",
        },
        createdBy: "user",
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
      },
    ],
  };
}

function createDocument(fsPath: string, text: string): vscodeTypes.TextDocument {
  return {
    uri: createUri(fsPath),
    languageId: "typescript",
    getText: () => text,
  } as vscodeTypes.TextDocument;
}

function createWorkspaceFolder(fsPath: string): MockWorkspaceFolder {
  return {
    uri: createUri(fsPath),
    name: path.basename(fsPath),
    index: 0,
  };
}

function createUri(fsPath: string): vscodeTypes.Uri {
  return {
    scheme: "file",
    fsPath,
    toString: () => `file://${fsPath}`,
  } as vscodeTypes.Uri;
}

async function createTempWorkspaceRoot(name: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `czaza-apply-change-to-notes-${name}-`));
}
