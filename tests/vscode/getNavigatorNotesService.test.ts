/** Unit tests for the Notes Navigator list payload. */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { WorkspaceNoteStore, WorkspaceNoteStoreRepository } from "@vscode/notes";
import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockWorkspaceFolder = {
  uri: vscodeTypes.Uri;
  name: string;
  index: number;
};

const mocks = vi.hoisted(() => ({
  workspaceFolders: [] as MockWorkspaceFolder[],
  outputDirectory: ".caca",
  stat: vi.fn(),
}));

vi.mock("vscode", () => ({
  FileType: {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },

  Uri: {
    file: (fsPath: string) => createUri(fsPath),
  },

  workspace: {
    get workspaceFolders() {
      return mocks.workspaceFolders;
    },

    fs: {
      stat: mocks.stat,
    },

    getConfiguration: () => ({
      get: <T>(key: string, defaultValue: T): T =>
        key === "outputDirectory" ? (mocks.outputDirectory as T) : defaultValue,
    }),

    getWorkspaceFolder: (uri: vscodeTypes.Uri) =>
      mocks.workspaceFolders.find((folder) => {
        const relativePath = path.relative(folder.uri.fsPath, uri.fsPath);
        return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
      }),
  },
}));

import { getNavigatorNotes } from "@vscode/services/getNavigatorNotesService";

const createdAt = "2026-07-19T00:00:00.000Z";

describe("getNavigatorNotes()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceFolders.length = 0;
    mocks.outputDirectory = ".caca";
    mocks.stat.mockImplementation((uri: vscodeTypes.Uri) => ({
      type: uri.fsPath.endsWith(".ts") ? 1 : 2,
    }));
  });

  it("excludes Project Notes from the project File Notes list", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "czaza-navigator-"));
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => "fixed001"));

    mocks.workspaceFolders.push({
      uri: createUri(workspaceRoot),
      name: path.basename(workspaceRoot),
      index: 0,
    });

    await notes.cache.saveSourceFile(
      workspaceRoot,
      mocks.outputDirectory,
      "",
      createStoredSourceFile("Project note."),
      createdAt,
    );
    await notes.cache.saveSourceFile(
      workspaceRoot,
      mocks.outputDirectory,
      "src/index.ts",
      createStoredSourceFile("File note."),
      createdAt,
    );

    const result = await getNavigatorNotes({
      uri: createUri(path.join(workspaceRoot, "src/index.ts")),
      notes,
    });

    expect(result.kind).toBe("resource");
    expect(result.kind === "resource" ? result.files : []).toEqual([
      expect.objectContaining({
        relativePath: "src/index.ts",
        name: "index.ts",
        resourceKind: "file",
        preview: "File note.",
      }),
    ]);
  });
});

function createStoredSourceFile(userNote: string): StoredSourceFile {
  return {
    source: {
      sourceHash: "sha256:source",
      programmingLanguage: "typescript",
    },
    fileNote: {
      id: "file",
      userNote,
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "user",
      createdAt,
      updatedAt: createdAt,
    },
    sectionNotes: [],
    lineNotes: [],
  };
}

function createUri(fsPath: string): vscodeTypes.Uri {
  return {
    scheme: "file",
    fsPath,
    path: fsPath,
    toString: () => `file://${fsPath}`,
  } as vscodeTypes.Uri;
}
