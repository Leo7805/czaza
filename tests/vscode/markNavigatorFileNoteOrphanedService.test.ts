/**
 * Unit tests for marking Navigator file notes as orphaned.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import type { NoteStatus } from "@shared/models/domain/common";
import { WorkspaceNoteStore, WorkspaceNoteStoreRepository } from "@vscode/notes";
import { markNavigatorFileNoteOrphanedService } from "@vscode/services/markNavigatorFileNoteOrphanedService";

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

describe("markNavigatorFileNoteOrphanedService()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceFolders.length = 0;
    mocks.outputDirectory = ".caca";
  });

  it("marks a file note orphaned while preserving its content status", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("confirmed");
    const notes = await createStoreWithSourceFile(workspaceRoot, "src/index.ts", {
      content: "stale",
      anchor: "confirmed",
    });

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    const changed = await markNavigatorFileNoteOrphanedService({
      currentUri: createUri(path.join(workspaceRoot, "src/index.ts")),
      notes,
      relativePath: "src/index.ts",
    });
    const sourceFile = await notes.cache.getSourceFile(workspaceRoot, ".caca", "src/index.ts");

    expect(changed).toBe(true);
    expect(sourceFile?.fileNote?.status).toEqual({
      content: "stale",
      anchor: "orphaned",
    });
  });

  it("does not update a file note that is already orphaned", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("orphaned");
    const notes = await createStoreWithSourceFile(workspaceRoot, "src/index.ts", {
      content: "current",
      anchor: "orphaned",
    });

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    const changed = await markNavigatorFileNoteOrphanedService({
      currentUri: createUri(path.join(workspaceRoot, "src/index.ts")),
      notes,
      relativePath: "src/index.ts",
    });

    expect(changed).toBe(false);
  });
});

async function createTempWorkspaceRoot(name: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `czaza-mark-orphaned-${name}-`));
}

async function createStoreWithSourceFile(
  workspaceRoot: string,
  relativePath: string,
  status: NoteStatus,
): Promise<WorkspaceNoteStore> {
  const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => "fixed001"));

  await notes.cache.saveSourceFile(workspaceRoot, ".caca", relativePath, createStoredSourceFile(status), createdAt);

  return notes;
}

function createStoredSourceFile(status: NoteStatus): StoredSourceFile {
  return {
    source: {
      sourceHash: "sha256:source",
      programmingLanguage: "typescript",
    },
    fileNote: {
      id: "file",
      userNote: "File note.",
      status,
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
