/**
 * Unit tests for manually relocating Navigator file notes.
 */

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { WorkspaceNoteStore, WorkspaceNoteStoreRepository } from "@vscode/notes";
import { relocateFileNoteService } from "@vscode/services/relocate";

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
  FileType: {
    File: 1,
    Directory: 2,
  },
  Uri: {
    file: (fsPath: string) => ({
      scheme: "file",
      fsPath,
      toString: () => `file://${fsPath}`,
    }),
  },
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
    fs: {
      stat: vi.fn(async (uri: vscodeTypes.Uri) => {
        const fs = await import("node:fs/promises");
        const stat = await fs.stat(uri.fsPath);

        return {
          type: stat.isDirectory() ? 2 : 1,
        };
      }),
    },
  },
}));

const createdAt = "2026-07-12T00:00:00.000Z";

describe("relocateFileNoteService()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceFolders.length = 0;
    mocks.outputDirectory = ".caca";
  });

  it("moves a file note to an existing file and confirms its anchor", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("success");
    const notes = await createStoreWithSourceFile(workspaceRoot, "src/old.ts");

    await writeSourceFile(workspaceRoot, "src/new.ts");
    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    const result = await relocateFileNoteService({
      currentUri: createUri(path.join(workspaceRoot, "src/old.ts")),
      notes,
      fromRelativePath: "src/old.ts",
      toRelativePath: "src/new.ts",
    });
    const movedSourceFile = await notes.cache.getSourceFile(workspaceRoot, ".caca", "src/new.ts");
    const oldSourceFile = await notes.cache.getSourceFile(workspaceRoot, ".caca", "src/old.ts");

    expect(result).toMatchObject({
      previousRelativePath: "src/old.ts",
      nextRelativePath: "src/new.ts",
    });
    expect(result.targetUri.fsPath).toBe(path.join(workspaceRoot, "src/new.ts"));
    expect(movedSourceFile?.fileNote?.status).toEqual({
      content: "stale",
      anchor: "confirmed",
    });
    expect(oldSourceFile).toBeUndefined();
  });

  it("rejects a target path that does not exist", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("missing-target");
    const notes = await createStoreWithSourceFile(workspaceRoot, "src/old.ts");

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    await expect(
      relocateFileNoteService({
        currentUri: createUri(path.join(workspaceRoot, "src/old.ts")),
        notes,
        fromRelativePath: "src/old.ts",
        toRelativePath: "src/missing.ts",
      }),
    ).rejects.toThrow("src/missing.ts does not exist.");
  });

  it("rejects files inside the configured CZaza output directory", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("managed-output");
    const notes = await createStoreWithSourceFile(workspaceRoot, "src/old.ts");

    await writeSourceFile(workspaceRoot, ".caca/notes/index.json");
    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    await expect(
      relocateFileNoteService({
        currentUri: createUri(path.join(workspaceRoot, "src/old.ts")),
        notes,
        fromRelativePath: "src/old.ts",
        toRelativePath: ".caca/notes/index.json",
      }),
    ).rejects.toThrow("CZaza-managed output files cannot be used as File Note targets.");

    expect(
      await notes.cache.getSourceFile(workspaceRoot, ".caca", "src/old.ts"),
    ).toBeDefined();
  });

  it("confirms an orphaned file note when relocating to its current path", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("self-orphaned");
    const notes = await createStoreWithSourceFile(workspaceRoot, "src/index.ts", "orphaned");

    await writeSourceFile(workspaceRoot, "src/index.ts");
    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    const result = await relocateFileNoteService({
      currentUri: createUri(path.join(workspaceRoot, "src/index.ts")),
      notes,
      fromRelativePath: "src/index.ts",
      toRelativePath: "src/index.ts",
    });
    const sourceFile = await notes.cache.getSourceFile(workspaceRoot, ".caca", "src/index.ts");

    expect(result).toMatchObject({
      previousRelativePath: "src/index.ts",
      nextRelativePath: "src/index.ts",
    });
    expect(sourceFile?.fileNote?.status).toEqual({
      content: "stale",
      anchor: "confirmed",
    });
  });

  it("rejects relocating a confirmed file note to its current path", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("self-confirmed");
    const notes = await createStoreWithSourceFile(workspaceRoot, "src/index.ts", "confirmed");

    await writeSourceFile(workspaceRoot, "src/index.ts");
    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    await expect(
      relocateFileNoteService({
        currentUri: createUri(path.join(workspaceRoot, "src/index.ts")),
        notes,
        fromRelativePath: "src/index.ts",
        toRelativePath: "src/index.ts",
      }),
    ).rejects.toThrow("src/index.ts is already linked.");
  });

  it("rejects a target path that already has stored notes", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("conflict");
    const notes = await createStoreWithSourceFile(workspaceRoot, "src/old.ts");

    await notes.cache.saveSourceFile(
      workspaceRoot,
      ".caca",
      "src/existing.ts",
      createStoredSourceFile(),
      createdAt,
    );
    await writeSourceFile(workspaceRoot, "src/existing.ts");
    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    await expect(
      relocateFileNoteService({
        currentUri: createUri(path.join(workspaceRoot, "src/old.ts")),
        notes,
        fromRelativePath: "src/old.ts",
        toRelativePath: "src/existing.ts",
      }),
    ).rejects.toThrow("src/existing.ts already has stored notes.");
  });

  it("rejects unsafe relative paths", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("unsafe");
    const notes = await createStoreWithSourceFile(workspaceRoot, "src/old.ts");

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    await expect(
      relocateFileNoteService({
        currentUri: createUri(path.join(workspaceRoot, "src/old.ts")),
        notes,
        fromRelativePath: "src/old.ts",
        toRelativePath: "../new.ts",
      }),
    ).rejects.toThrow("Enter a path relative to the CZaza root.");
  });
});

async function createTempWorkspaceRoot(name: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `czaza-relocate-${name}-`));
}

async function createStoreWithSourceFile(
  workspaceRoot: string,
  relativePath: string,
  anchor: "confirmed" | "needsConfirmation" | "orphaned" = "needsConfirmation",
): Promise<WorkspaceNoteStore> {
  const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => "fixed001"));

  await notes.cache.saveSourceFile(workspaceRoot, ".caca", relativePath, createStoredSourceFile(anchor), createdAt);

  return notes;
}

async function writeSourceFile(workspaceRoot: string, relativePath: string): Promise<void> {
  const filePath = path.join(workspaceRoot, ...relativePath.split("/"));

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "export const value = 1;\n", "utf-8");
}

function createStoredSourceFile(anchor: "confirmed" | "needsConfirmation" | "orphaned" = "needsConfirmation"): StoredSourceFile {
  return {
    source: {
      sourceHash: "sha256:source",
      programmingLanguage: "typescript",
    },
    fileNote: {
      id: "file",
      userNote: "File note.",
      status: {
        content: "stale",
        anchor,
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
