/**
 * Unit tests for stored Navigator file-note detail payloads.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { WorkspaceNoteStore, WorkspaceNoteStoreRepository } from "@vscode/notes";
import { getStoredNavigatorFileNotes } from "@vscode/services/getStoredNavigatorFileNotesService";

type MockWorkspaceFolder = {
  uri: vscodeTypes.Uri;
  name: string;
  index: number;
};

const mocks = vi.hoisted(() => ({
  workspaceFolders: [] as MockWorkspaceFolder[],
  outputDirectory: ".caca",
}));

vi.mock("vscode", () => ({
  workspace: {
    get workspaceFolders() {
      return mocks.workspaceFolders;
    },
    getConfiguration: () => ({
      get: <T>(key: string, defaultValue: T): T => {
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

const createdAt = "2026-07-12T00:00:00.000Z";

describe("getStoredNavigatorFileNotes()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceFolders.length = 0;
    mocks.outputDirectory = ".caca";
  });

  it("builds a file detail payload without reading the source file", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("stored");
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => "fixed001"));

    await notes.cache.saveSourceFile(workspaceRoot, ".caca", "src/missing.ts", createStoredSourceFile(), createdAt);
    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    const payload = await getStoredNavigatorFileNotes({
      currentUri: createUri(path.join(workspaceRoot, "src/current.ts")),
      notes,
      relativePath: "src/missing.ts",
    });

    expect(payload).toMatchObject({
      kind: "file",
      name: "missing.ts",
      relativePath: "src/missing.ts",
      fileNote: {
        userNote: "File note.",
        status: {
          content: "stale",
          anchor: "orphaned",
        },
      },
      aiAction: "regenerate",
      activeLine: 7,
      lineNote: {
        line: 7,
        userNote: "Line note.",
      },
    });
    expect(payload.kind === "file" ? payload.sectionNotes : []).toEqual([
      expect.objectContaining({
        id: "section:intro",
        title: "Intro",
        startLine: 3,
        endLine: 9,
        userNote: "Section note.",
      }),
    ]);
  });

  it("throws when the stored source file is missing", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("missing");
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => "fixed001"));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    await expect(
      getStoredNavigatorFileNotes({
        currentUri: createUri(path.join(workspaceRoot, "src/current.ts")),
        notes,
        relativePath: "src/missing.ts",
      }),
    ).rejects.toThrow("src/missing.ts no longer has stored notes.");
  });
});

async function createTempWorkspaceRoot(name: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `czaza-stored-detail-${name}-`));
}

function createStoredSourceFile(): StoredSourceFile {
  return {
    source: {
      sourceHash: "sha256:source",
      programmingLanguage: "typescript",
    },
    fileNote: {
      id: "file",
      userNote: "File note.",
      aiExplanation: {
        summary: "File summary.",
        detail: "File detail.",
      },
      status: {
        content: "stale",
        anchor: "orphaned",
      },
      createdBy: "user",
      createdAt,
      updatedAt: createdAt,
    },
    sectionNotes: [
      {
        id: "section:intro",
        title: "Intro",
        range: {
          startLine: 3,
          endLine: 9,
        },
        anchorHash: "sha256:section",
        userNote: "Section note.",
        status: {
          content: "current",
          anchor: "orphaned",
        },
        createdBy: "user",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    lineNotes: [
      {
        id: "line:7",
        line: 7,
        anchorText: "const value = 1;",
        userNote: "Line note.",
        status: {
          content: "current",
          anchor: "orphaned",
        },
        createdBy: "user",
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };
}

function createWorkspaceFolder(workspaceRoot: string): MockWorkspaceFolder {
  return {
    uri: createUri(workspaceRoot),
    name: path.basename(workspaceRoot),
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
