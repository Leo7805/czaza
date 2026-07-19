/**
 * Unit tests for clearing stale note status from the webview.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { createSourceHash } from "@shared/utils/hashUtils";
import { WorkspaceNoteStore, WorkspaceNoteStoreRepository } from "@vscode/notes";
import { clearNoteStaleStatusService } from "@vscode/services/clearNoteStaleStatusService";

type MockWorkspaceFolder = {
  uri: vscodeTypes.Uri;
  name: string;
  index: number;
};

const mocks = vi.hoisted(() => ({
  workspaceFolders: [] as MockWorkspaceFolder[],
  configuredRootDirectory: "",
  outputDirectory: ".caca",
  randomId: "abcdef123456",
  sourceText: "const value = 1;\nconst next = 2;\nreturn value;\nexport { value };\n",
  languageId: "typescript",
}));

vi.mock("vscode", () => ({
  FileType: {
    File: 1,
    Directory: 2,
  },
  workspace: {
    get workspaceFolders() {
      return mocks.workspaceFolders;
    },

    fs: {
      stat: vi.fn().mockResolvedValue({ type: 1, size: 100, mtime: 1, ctime: 1 }),
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

    openTextDocument: vi.fn().mockImplementation(async (uri: vscodeTypes.Uri) => ({
      uri,
      languageId: mocks.languageId,
      getText: () => mocks.sourceText,
    })),
  },
}));

const createdAt = "2026-07-12T00:00:00.000Z";

describe("clearNoteStaleStatusService()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceFolders.length = 0;
    mocks.configuredRootDirectory = "";
    mocks.outputDirectory = ".caca";
    mocks.sourceText = "const value = 1;\nconst next = 2;\nreturn value;\nexport { value };\n";
    mocks.languageId = "typescript";
  });

  it("marks a stale file note current and updates the source metadata", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("file");
    const notes = await createStoreWithSourceFile(workspaceRoot, "src/index.ts");

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    const changed = await clearNoteStaleStatusService({
      uri: createUri(path.join(workspaceRoot, "src/index.ts")),
      notes,
      target: { level: "file" },
    });
    const sourceFile = await notes.cache.getSourceFile(workspaceRoot, ".caca", "src/index.ts");

    expect(changed).toBe(true);
    expect(sourceFile?.fileNote?.status).toEqual({
      content: "current",
      anchor: "confirmed",
    });
    expect(sourceFile?.source).toEqual({
      sourceHash: createSourceHash(mocks.sourceText),
      programmingLanguage: "typescript",
    });
  });

  it("marks stale section and line notes current and updates their anchors independently", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("section-line");
    const notes = await createStoreWithSourceFile(workspaceRoot, "src/index.ts");
    const uri = createUri(path.join(workspaceRoot, "src/index.ts"));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    await clearNoteStaleStatusService({
      uri,
      notes,
      target: { level: "section", sectionId: "section:intro" },
    });
    await clearNoteStaleStatusService({
      uri,
      notes,
      target: { level: "line", line: 3 },
    });

    const sourceFile = await notes.cache.getSourceFile(workspaceRoot, ".caca", "src/index.ts");

    expect(sourceFile?.sectionNotes[0]?.status).toEqual({
      content: "current",
      anchor: "confirmed",
    });
    expect(sourceFile?.sectionNotes[0]?.anchorHash).toBe(
      createSourceHash("const value = 1;\nconst next = 2;\nreturn value;\nexport { value };"),
    );
    expect(sourceFile?.lineNotes[0]?.status).toEqual({
      content: "current",
      anchor: "confirmed",
    });
    expect(sourceFile?.lineNotes[0]?.anchorText).toBe("return value;");
    expect(sourceFile?.fileNote?.status.content).toBe("stale");
  });

  it("does not update a note that is already content-current", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("current");
    const notes = await createStoreWithSourceFile(workspaceRoot, "src/index.ts");
    const sourceFile = await notes.cache.getSourceFile(workspaceRoot, ".caca", "src/index.ts");

    if (sourceFile?.fileNote) {
      sourceFile.fileNote.status = { content: "current", anchor: "confirmed" };
      await notes.cache.saveSourceFile(workspaceRoot, ".caca", "src/index.ts", sourceFile, createdAt);
    }

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    const changed = await clearNoteStaleStatusService({
      uri: createUri(path.join(workspaceRoot, "src/index.ts")),
      notes,
      target: { level: "file" },
    });

    expect(changed).toBe(false);
  });
});

async function createStoreWithSourceFile(
  workspaceRoot: string,
  relativePath: string,
): Promise<WorkspaceNoteStore> {
  const notes = new WorkspaceNoteStore(new WorkspaceNoteStoreRepository(() => mocks.randomId));

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
        range: { startLine: 1, endLine: 4 },
        anchorHash: "sha256:section",
        userNote: "Section note.",
        status: {
          content: "stale",
          anchor: "needsConfirmation",
        },
        createdBy: "user",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    lineNotes: [
      {
        id: "line:3",
        line: 3,
        anchorText: "return value;",
        userNote: "Line note.",
        status: {
          content: "stale",
          anchor: "confirmed",
        },
        createdBy: "user",
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };
}

function createWorkspaceFolder(fsPath: string): MockWorkspaceFolder {
  return {
    uri: createUri(fsPath),
    name: path.basename(fsPath),
    index: mocks.workspaceFolders.length,
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

async function createTempWorkspaceRoot(name: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `czaza-resolve-stale-${name}-`));
}
