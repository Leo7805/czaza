/**
 * Unit tests for read-only Runtime Note State detection.
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
  outputDirectory: ".czaza",
}));

vi.mock("vscode", () => ({
  workspace: {
    get workspaceFolders() {
      return mocks.workspaceFolders;
    },

    getWorkspaceFolder: (uri: vscodeTypes.Uri) =>
      mocks.workspaceFolders.find((folder) => {
        const relativePath = path.relative(folder.uri.fsPath, uri.fsPath);
        return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
      }),

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
  },
}));

import type { WorkspaceNoteStore } from "@vscode/notes";
import { detectRuntimeNoteStateService } from "@vscode/services/runtimeState";

describe("detectRuntimeNoteStateService()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceFolders.length = 0;
    mocks.configuredRootDirectory = "";
    mocks.outputDirectory = ".czaza";
  });

  it("returns current when source content still matches persistent Notes", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("current");
    const sourceText = "export const value = 1;\n";
    const notes = createNotes(createStoredSourceFile(sourceText));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    const result = await detectRuntimeNoteStateService({
      document: createDocument(path.join(workspaceRoot, "src/index.ts"), sourceText),
      notes: notes.value,
      now: "2026-07-29T00:00:00.000Z",
    });

    expect(result).toEqual({
      kind: "current",
      relativePath: "src/index.ts",
      currentSourceHash: createSourceHash(sourceText),
      coordinates: {
        workspaceRoot,
        outputDirectory: ".czaza",
        relativePath: "src/index.ts",
      },
    });
    expect(notes.saveSourceFile).not.toHaveBeenCalled();
  });

  it("returns stale File Note state after source content changes", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("stale");
    const notes = createNotes(createStoredSourceFile("export const value = 1;\n"));
    const nextText = "export const value = 2;\n";

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    const result = await detectRuntimeNoteStateService({
      document: createDocument(path.join(workspaceRoot, "src/index.ts"), nextText),
      notes: notes.value,
      now: "2026-07-29T01:00:00.000Z",
    });

    expect(result).toEqual(
      expect.objectContaining({
        kind: "affected",
        state: expect.objectContaining({
          issues: expect.arrayContaining(["stale"]),
          reason: "anchorChanged",
          currentSourceHash: createSourceHash(nextText),
          targetChanges: expect.arrayContaining([
            expect.objectContaining({
              kind: "file",
              status: {
                content: "stale",
                anchor: "confirmed",
              },
            }),
          ]),
        }),
      }),
    );
    expect(notes.saveSourceFile).not.toHaveBeenCalled();
  });

  it("returns location review overlays for changed Section and Line anchors", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("location-review");
    const notes = createNotes(createStoredSourceFile("export const value = 1;\n"));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    const result = await detectRuntimeNoteStateService({
      document: createDocument(
        path.join(workspaceRoot, "src/index.ts"),
        "export const value = 2;\n",
      ),
      notes: notes.value,
      now: "2026-07-29T02:00:00.000Z",
    });

    expect(result.kind).toBe("affected");

    if (result.kind !== "affected") {
      return;
    }

    expect(result.state.issues).toEqual(["stale", "locationReview"]);
    expect(result.state.targetChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "section",
          noteId: "section:1",
          status: {
            content: "stale",
            anchor: "needsConfirmation",
          },
        }),
        expect.objectContaining({
          kind: "line",
          noteId: "line:1",
          status: {
            content: "stale",
            anchor: "needsConfirmation",
          },
        }),
      ]),
    );
    expect(notes.saveSourceFile).not.toHaveBeenCalled();
  });

  it("returns untracked when no persistent source Note bundle exists", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("untracked");
    const notes = createNotes(undefined);

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    const result = await detectRuntimeNoteStateService({
      document: createDocument(path.join(workspaceRoot, "src/index.ts"), "export {};\n"),
      notes: notes.value,
      now: "2026-07-29T03:00:00.000Z",
    });

    expect(result).toEqual({
      kind: "untracked",
      relativePath: "src/index.ts",
      coordinates: {
        workspaceRoot,
        outputDirectory: ".czaza",
        relativePath: "src/index.ts",
      },
    });
    expect(notes.saveSourceFile).not.toHaveBeenCalled();
  });

  it("ignores resources outside the open workspace", async () => {
    const notes = createNotes(createStoredSourceFile("export {};\n"));
    const result = await detectRuntimeNoteStateService({
      document: createDocument("/external/index.ts", "export {};\n"),
      notes: notes.value,
      now: "2026-07-29T04:00:00.000Z",
    });

    expect(result).toEqual({
      kind: "ignored",
      reason: "outsideWorkspace",
    });
    expect(notes.getSourceFile).not.toHaveBeenCalled();
    expect(notes.saveSourceFile).not.toHaveBeenCalled();
  });

  it("ignores CZaza Note Store resources", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("note-store");
    const notes = createNotes(createStoredSourceFile("{}"));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    const result = await detectRuntimeNoteStateService({
      document: createDocument(
        path.join(workspaceRoot, ".czaza/notes/index.json"),
        "{}",
      ),
      notes: notes.value,
      now: "2026-07-29T05:00:00.000Z",
    });

    expect(result).toEqual({
      kind: "ignored",
      reason: "noteStore",
    });
    expect(notes.getSourceFile).not.toHaveBeenCalled();
    expect(notes.saveSourceFile).not.toHaveBeenCalled();
  });
});

/**
 * Creates a Note Store mock that records any accidental persistence.
 *
 * @param sourceFile - Persistent source Note bundle returned by reads.
 * @returns Note Store mock and read/write spies.
 */
function createNotes(sourceFile: StoredSourceFile | undefined): {
  value: WorkspaceNoteStore;
  getSourceFile: ReturnType<typeof vi.fn>;
  saveSourceFile: ReturnType<typeof vi.fn>;
} {
  const getSourceFile = vi.fn().mockResolvedValue(sourceFile);
  const saveSourceFile = vi.fn().mockResolvedValue(undefined);

  return {
    value: {
      cache: {
        getSourceFile,
        saveSourceFile,
      },
    } as unknown as WorkspaceNoteStore,
    getSourceFile,
    saveSourceFile,
  };
}

/**
 * Creates persistent File, Section, and Line Notes for one source line.
 *
 * @param sourceText - Source text represented by the stored anchors.
 * @returns Stored source Note fixture.
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
 * Creates a minimal source document for Runtime Note detection.
 *
 * @param fsPath - Absolute source file path.
 * @param text - Current source content.
 * @returns Mock source document.
 */
function createDocument(fsPath: string, text: string): vscodeTypes.TextDocument {
  return {
    uri: createUri(fsPath),
    languageId: "typescript",
    getText: () => text,
  } as vscodeTypes.TextDocument;
}

/**
 * Creates a minimal workspace folder.
 *
 * @param fsPath - Absolute workspace path.
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
 * Creates a local file URI mock.
 *
 * @param fsPath - Absolute file path.
 * @returns Mock file URI.
 */
function createUri(fsPath: string): vscodeTypes.Uri {
  return {
    scheme: "file",
    fsPath,
    toString: () => `file://${fsPath}`,
  } as vscodeTypes.Uri;
}

/**
 * Creates a real temporary workspace root for resource Gate validation.
 *
 * @param name - Scenario suffix used in the temporary directory prefix.
 * @returns Absolute temporary workspace path.
 */
async function createTempWorkspaceRoot(name: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `czaza-runtime-detection-${name}-`));
}
