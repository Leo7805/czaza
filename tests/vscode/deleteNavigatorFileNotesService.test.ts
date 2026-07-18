/**
 * Unit tests for deleting Navigator file notes bundles.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { WorkspaceNoteStore, WorkspaceNoteStoreRepository } from "@vscode/notes";
import { deleteNavigatorFileNotesService } from "@vscode/services/deleteNavigatorFileNotesService";

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

describe("deleteNavigatorFileNotesService()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceFolders.length = 0;
    mocks.outputDirectory = ".caca";
  });

  it("deletes a stored file notes bundle", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("delete");
    const notes = await createStoreWithSourceFile(workspaceRoot, "src/index.ts");

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    const deleted = await deleteNavigatorFileNotesService({
      currentUri: createUri(path.join(workspaceRoot, "src/index.ts")),
      notes,
      relativePath: "src/index.ts",
    });
    const index = await notes.cache.getRequiredIndex(workspaceRoot, ".caca");
    const sourceFile = await notes.cache.getSourceFile(workspaceRoot, ".caca", "src/index.ts");

    expect(deleted).toBe(true);
    expect(index.files["src/index.ts"]).toBeUndefined();
    expect(sourceFile).toBeUndefined();
  });

  it("returns false when the stored file notes bundle is missing", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("missing");
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => "fixed001"));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    const deleted = await deleteNavigatorFileNotesService({
      currentUri: createUri(path.join(workspaceRoot, "src/index.ts")),
      notes,
      relativePath: "src/missing.ts",
    });

    expect(deleted).toBe(false);
  });

  it("rejects unsafe relative paths", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("unsafe");
    const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => "fixed001"));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    await expect(
      deleteNavigatorFileNotesService({
        currentUri: createUri(path.join(workspaceRoot, "src/index.ts")),
        notes,
        relativePath: "../missing.ts",
      }),
    ).rejects.toThrow("Enter a path relative to the CZaza root.");
  });
});

async function createTempWorkspaceRoot(name: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `czaza-delete-notes-${name}-`));
}

async function createStoreWithSourceFile(
  workspaceRoot: string,
  relativePath: string,
): Promise<WorkspaceNoteStore> {
  const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => "fixed001"));

  await notes.cache.saveSourceFile(workspaceRoot, ".caca", relativePath, createStoredSourceFile(), createdAt);

  return notes;
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
