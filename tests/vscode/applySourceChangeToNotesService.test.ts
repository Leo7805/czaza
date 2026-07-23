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
      change: createSpliceChange(),
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
        reason: "multipleChanges",
      },
      notes: notes.value,
      now: "2026-07-18T00:00:00.000Z",
    });

    expect(result).toEqual({
      kind: "unsupported",
      reason: "multipleChanges",
    });
    expect(notes.saveSourceFile).not.toHaveBeenCalled();
  });

  it("does not save untracked files", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("untracked");
    const notes = createNotes(undefined);

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    const result = await applySourceChangeToNotesService({
      document: createDocument(path.join(workspaceRoot, "src/index.ts"), "export const value = 2;\n"),
      change: createSpliceChange(),
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

/**
 * Creates a line-neutral classified splice for service integration tests.
 *
 * @returns Classified replacement on the first source line.
 */
function createSpliceChange() {
  return {
    kind: "splice" as const,
    splice: {
      startLine: 0,
      startCharacter: 21,
      endLine: 0,
      endCharacter: 22,
      insertedLineCount: 0,
      deletedLineCount: 0,
      lineDelta: 0,
    },
  };
}

/**
 * Creates a mocked workspace Note store around an optional source bundle.
 *
 * @param sourceFile - Stored source bundle returned by the mock cache.
 * @returns Mock Note store and its save spy.
 */
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

/**
 * Creates a stored source bundle containing File, Section, and Line Notes.
 *
 * @param sourceText - Source text represented by the stored bundle.
 * @returns Stored source bundle for service tests.
 */
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

/**
 * Creates the minimal VS Code text document used by the service.
 *
 * @param fsPath - Absolute document path.
 * @param text - Current document text.
 * @returns Mock VS Code text document.
 */
function createDocument(fsPath: string, text: string): vscodeTypes.TextDocument {
  return {
    uri: createUri(fsPath),
    languageId: "typescript",
    getText: () => text,
  } as vscodeTypes.TextDocument;
}

/**
 * Creates a mock VS Code workspace folder.
 *
 * @param fsPath - Absolute workspace folder path.
 * @returns Mock workspace folder.
 */
function createWorkspaceFolder(fsPath: string): MockWorkspaceFolder {
  return {
    uri: createUri(fsPath),
    name: path.basename(fsPath),
    index: 0,
  };
}

/**
 * Creates a minimal file URI for VS Code service tests.
 *
 * @param fsPath - Absolute filesystem path.
 * @returns Mock VS Code file URI.
 */
function createUri(fsPath: string): vscodeTypes.Uri {
  return {
    scheme: "file",
    fsPath,
    toString: () => `file://${fsPath}`,
  } as vscodeTypes.Uri;
}

/**
 * Creates an isolated temporary workspace root.
 *
 * @param name - Suffix identifying the test scenario.
 * @returns Absolute path to the temporary workspace.
 */
async function createTempWorkspaceRoot(name: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `czaza-apply-change-to-notes-${name}-`));
}
