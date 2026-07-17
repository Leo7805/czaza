/**
 * Unit tests for synchronizing stored notes with VS Code file resource events.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

type RenameListener = (event: vscodeTypes.FileRenameEvent) => void;
type DeleteListener = (event: vscodeTypes.FileDeleteEvent) => void;
type MockWorkspaceFolder = {
  uri: vscodeTypes.Uri;
  name: string;
  index: number;
};

const mocks = vi.hoisted(() => ({
  workspaceFolders: [] as MockWorkspaceFolder[],
  configuredRootDirectory: "",
  outputDirectory: ".caca",
  renameListeners: [] as RenameListener[],
  deleteListeners: [] as DeleteListener[],
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

    onDidRenameFiles: (listener: RenameListener) => {
      mocks.renameListeners.push(listener);
      return { dispose: vi.fn() };
    },

    onDidDeleteFiles: (listener: DeleteListener) => {
      mocks.deleteListeners.push(listener);
      return { dispose: vi.fn() };
    },
  },
}));

import { registerNotesResourceEvents } from "@vscode/events";
import type { WorkspaceNoteStore } from "@vscode/notes";
import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";

describe("registerNotesResourceEvents()", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.workspaceFolders.length = 0;
    mocks.renameListeners.length = 0;
    mocks.deleteListeners.length = 0;
    mocks.configuredRootDirectory = "";
    mocks.outputDirectory = ".caca";
  });

  it("moves source file note entries for VS Code rename events", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("rename");
    const workspace = createWorkspaceFolder(workspaceRoot);
    const notes = createNotes();
    const notesProvider = createNotesProvider();
    const context = createExtensionContext();
    const newUri = createUri(path.join(workspaceRoot, "src/new.ts"));

    mocks.workspaceFolders.push(workspace);
    registerNotesResourceEvents(context, notes.value, notesProvider.value);
    mocks.renameListeners[0]?.({
      files: [
        {
          oldUri: createUri(path.join(workspaceRoot, "src/old.ts")),
          newUri,
        },
      ],
    });

    await waitForMicrotasks();

    expect(notes.moveSourceFileEntry).toHaveBeenCalledWith(
      workspaceRoot,
      ".caca",
      "src/old.ts",
      "src/new.ts",
      expect.any(String),
    );
    expect(notesProvider.refreshAfterResourceMove).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: path.join(workspaceRoot, "src/old.ts") }),
      newUri,
    );
    expect(context.subscriptions).toHaveLength(2);
  });

  it("marks source file note entries deleted for VS Code delete events", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("delete");
    const workspace = createWorkspaceFolder(workspaceRoot);
    const notes = createNotes();
    const notesProvider = createNotesProvider();
    const deletedUri = createUri(path.join(workspaceRoot, "src/deleted.ts"));

    mocks.workspaceFolders.push(workspace);
    registerNotesResourceEvents(createExtensionContext(), notes.value, notesProvider.value);
    mocks.deleteListeners[0]?.({
      files: [deletedUri],
    });

    await waitForMicrotasks();

    expect(notes.markSourceFileEntryDeleted).toHaveBeenCalledWith(
      workspaceRoot,
      ".caca",
      "src/deleted.ts",
      expect.any(String),
    );
    expect(notesProvider.refreshAfterResourceDelete).toHaveBeenCalledWith(deletedUri);
  });

  it("ignores rename events that cross configured CZaza roots", async () => {
    const firstRoot = await createTempWorkspaceRoot("first");
    const secondRoot = await createTempWorkspaceRoot("second");
    const firstWorkspace = createWorkspaceFolder(firstRoot, 0);
    const secondWorkspace = createWorkspaceFolder(secondRoot, 1);
    const notes = createNotes();
    const notesProvider = createNotesProvider();

    mocks.workspaceFolders.push(firstWorkspace, secondWorkspace);
    registerNotesResourceEvents(createExtensionContext(), notes.value, notesProvider.value);
    mocks.renameListeners[0]?.({
      files: [
        {
          oldUri: createUri(path.join(firstRoot, "src/old.ts")),
          newUri: createUri(path.join(secondRoot, "src/new.ts")),
        },
      ],
    });

    await waitForMicrotasks();

    expect(notes.moveSourceFileEntry).not.toHaveBeenCalled();
    expect(notesProvider.refreshAfterResourceMove).not.toHaveBeenCalled();
    expect(notesProvider.refreshAfterResourceDelete).not.toHaveBeenCalled();
  });
});

function createNotes(): {
  value: WorkspaceNoteStore;
  moveSourceFileEntry: ReturnType<typeof vi.fn>;
  markSourceFileEntryDeleted: ReturnType<typeof vi.fn>;
} {
  const moveSourceFileEntry = vi.fn().mockResolvedValue({ kind: "moved" });
  const markSourceFileEntryDeleted = vi.fn().mockResolvedValue({ kind: "markedDeleted" });

  return {
    value: {
      resources: {
        moveSourceFileEntry,
        markSourceFileEntryDeleted,
      },
    } as unknown as WorkspaceNoteStore,
    moveSourceFileEntry,
    markSourceFileEntryDeleted,
  };
}

function createNotesProvider(): {
  value: NotesViewProvider;
  refreshAfterResourceMove: ReturnType<typeof vi.fn>;
  refreshAfterResourceDelete: ReturnType<typeof vi.fn>;
} {
  const refreshAfterResourceMove = vi.fn().mockResolvedValue(undefined);
  const refreshAfterResourceDelete = vi.fn().mockResolvedValue(undefined);

  return {
    value: {
      refreshAfterResourceMove,
      refreshAfterResourceDelete,
    } as unknown as NotesViewProvider,
    refreshAfterResourceMove,
    refreshAfterResourceDelete,
  };
}

function createExtensionContext(): vscodeTypes.ExtensionContext {
  return {
    subscriptions: [],
  } as unknown as vscodeTypes.ExtensionContext;
}

function createWorkspaceFolder(fsPath: string, index = 0): MockWorkspaceFolder {
  return {
    uri: createUri(fsPath),
    name: path.basename(fsPath),
    index,
  };
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
  return mkdtemp(path.join(tmpdir(), `czaza-resource-events-${name}-`));
}
