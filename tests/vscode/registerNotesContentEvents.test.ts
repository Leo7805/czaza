/**
 * Unit tests for marking file notes stale after saved content changes.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { createSourceHash } from "@shared/utils/hashUtils";

type SaveListener = (document: vscodeTypes.TextDocument) => void;
type MockWorkspaceFolder = {
  uri: vscodeTypes.Uri;
  name: string;
  index: number;
};

const mocks = vi.hoisted(() => ({
  workspaceFolders: [] as MockWorkspaceFolder[],
  configuredRootDirectory: "",
  outputDirectory: ".caca",
  saveListeners: [] as SaveListener[],
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

    onDidSaveTextDocument: (listener: SaveListener) => {
      mocks.saveListeners.push(listener);
      return { dispose: vi.fn() };
    },
  },
}));

import { registerNotesContentEvents } from "@vscode/events";
import type { WorkspaceNoteStore } from "@vscode/notes";
import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";

describe("registerNotesContentEvents()", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.workspaceFolders.length = 0;
    mocks.saveListeners.length = 0;
    mocks.configuredRootDirectory = "";
    mocks.outputDirectory = ".caca";
  });

  it("marks file notes stale and updates source hash after a saved content change", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("changed");
    const previousText = "export const value = 1;\n";
    const nextText = "export const value = 2;\n";
    const sourceFile = createStoredSourceFile(previousText);
    const notes = createNotes(sourceFile);
    const notesProvider = createNotesProvider();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(createExtensionContext(), notes.value, notesProvider.value);
    const document = createDocument(path.join(workspaceRoot, "src/index.ts"), nextText);
    mocks.saveListeners[0]?.(document);

    await waitForMicrotasks();

    expect(notes.saveSourceFile).toHaveBeenCalledOnce();
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
      }),
      expect.any(String),
    );
    expect(notesProvider.refreshCurrentNotes).toHaveBeenCalledWith(document.uri);
  });

  it("does not save when the source hash is unchanged", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("unchanged");
    const sourceText = "export const value = 1;\n";
    const notes = createNotes(createStoredSourceFile(sourceText));
    const notesProvider = createNotesProvider();

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(createExtensionContext(), notes.value, notesProvider.value);
    mocks.saveListeners[0]?.(createDocument(path.join(workspaceRoot, "src/index.ts"), sourceText));

    await waitForMicrotasks();

    expect(notes.saveSourceFile).not.toHaveBeenCalled();
    expect(notesProvider.refreshCurrentNotes).not.toHaveBeenCalled();
  });

  it("does not save when the source file has no stored notes", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("missing");
    const notes = createNotes(undefined);

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesContentEvents(createExtensionContext(), notes.value);
    mocks.saveListeners[0]?.(createDocument(path.join(workspaceRoot, "src/index.ts"), "export {};\n"));

    await waitForMicrotasks();

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

function createNotesProvider(): {
  value: NotesViewProvider;
  refreshCurrentNotes: ReturnType<typeof vi.fn>;
} {
  const refreshCurrentNotes = vi.fn().mockResolvedValue(undefined);

  return {
    value: { refreshCurrentNotes } as unknown as NotesViewProvider,
    refreshCurrentNotes,
  };
}

function createStoredSourceFile(sourceText: string): StoredSourceFile {
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
    sectionNotes: [],
    lineNotes: [],
  };
}

function createExtensionContext(): vscodeTypes.ExtensionContext {
  return {
    subscriptions: [],
  } as unknown as vscodeTypes.ExtensionContext;
}

function createWorkspaceFolder(fsPath: string): MockWorkspaceFolder {
  return {
    uri: createUri(fsPath),
    name: path.basename(fsPath),
    index: 0,
  };
}

function createDocument(fsPath: string, text: string): vscodeTypes.TextDocument {
  return {
    uri: createUri(fsPath),
    getText: () => text,
  } as vscodeTypes.TextDocument;
}

function createUri(fsPath: string): vscodeTypes.Uri {
  return {
    scheme: "file",
    fsPath,
    toString: () => `file://${fsPath}`,
  } as vscodeTypes.Uri;
}

async function waitForMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function createTempWorkspaceRoot(name: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `czaza-content-events-${name}-`));
}
