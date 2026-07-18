/**
 * Unit tests for checking and saving changed file note status.
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

import { checkChangedFileNotesService } from "@vscode/services/checkChangedFileNotesService";
import type { WorkspaceNoteStore } from "@vscode/notes";

describe("checkChangedFileNotesService()", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.workspaceFolders.length = 0;
    mocks.configuredRootDirectory = "";
    mocks.outputDirectory = ".caca";
  });

  it("updates status for the changed file note bundle only", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("changed");
    const previousText = "export const value = 1;\n";
    const nextText = "export const value = 2;\n";
    const notes = createNotes(createStoredSourceFile(previousText));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    const result = await checkChangedFileNotesService({
      document: createDocument(path.join(workspaceRoot, "src/index.ts"), nextText),
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
        fileNote: expect.objectContaining({
          status: {
            content: "stale",
            anchor: "confirmed",
          },
        }),
        sectionNotes: [
          expect.objectContaining({
            status: {
              content: "stale",
              anchor: "needsConfirmation",
            },
          }),
        ],
        lineNotes: [
          expect.objectContaining({
            status: {
              content: "stale",
              anchor: "needsConfirmation",
            },
          }),
        ],
      }),
      "2026-07-18T00:00:00.000Z",
    );
  });

  it("does not mark section location review when saving after deterministic line deletion", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("deterministic-save");
    const previousText = "export const first = 1;\nexport const second = 2;\n";
    const nextText = "export const first = 1;\n";
    const sourceFile = createStoredSourceFile(previousText);
    sourceFile.source.sourceHash = createSourceHash(nextText);
    sourceFile.sectionNotes[0]!.range = {
      startLine: 1,
      endLine: 1,
    };
    sourceFile.sectionNotes[0]!.anchorHash = createSourceHash(previousText.trimEnd());
    sourceFile.sectionNotes[0]!.status = {
      content: "stale",
      anchor: "confirmed",
    };
    const notes = createNotes(sourceFile);

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    const result = await checkChangedFileNotesService({
      document: createDocument(path.join(workspaceRoot, "src/index.ts"), nextText),
      notes: notes.value,
      now: "2026-07-18T00:00:00.000Z",
    });

    expect(result.kind).toBe("unchanged");
    expect(notes.saveSourceFile).not.toHaveBeenCalled();
  });

  it("does not save untracked files", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("untracked");
    const notes = createNotes(undefined);

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    const result = await checkChangedFileNotesService({
      document: createDocument(path.join(workspaceRoot, "src/index.ts"), "export {};\n"),
      notes: notes.value,
      now: "2026-07-18T00:00:00.000Z",
    });

    expect(result).toEqual({
      kind: "untracked",
      relativePath: "src/index.ts",
    });
    expect(notes.saveSourceFile).not.toHaveBeenCalled();
  });

  it("ignores non-file documents", async () => {
    const notes = createNotes(createStoredSourceFile("export {};\n"));

    const result = await checkChangedFileNotesService({
      document: {
        uri: {
          scheme: "untitled",
          fsPath: "/workspace/Untitled-1",
          toString: () => "untitled:Untitled-1",
        } as vscodeTypes.Uri,
        languageId: "typescript",
        getText: () => "export {};\n",
      },
      notes: notes.value,
      now: "2026-07-18T00:00:00.000Z",
    });

    expect(result).toEqual({
      kind: "ignored",
      reason: "nonFileUri",
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
  return mkdtemp(path.join(tmpdir(), `czaza-changed-file-notes-${name}-`));
}
