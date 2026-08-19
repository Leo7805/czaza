/**
 * Unit tests for deterministic VS Code file resource events.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

type RenameListener = (event: vscodeTypes.FileRenameEvent) => void;
type DeleteListener = (event: vscodeTypes.FileDeleteEvent) => void;
type WillDeleteListener = (event: vscodeTypes.FileWillDeleteEvent) => void;
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
  willDeleteListeners: [] as WillDeleteListener[],
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

    onWillDeleteFiles: (listener: WillDeleteListener) => {
      mocks.willDeleteListeners.push(listener);
      return { dispose: vi.fn() };
    },
  },
}));

import { registerNotesResourceEvents } from "@vscode/events";
import type { WorkspaceNoteStore } from "@vscode/notes";
import type { NotesViewProvider } from "@vscode/notesUi/NotesViewProvider";
import type { SourceRelocationHistoryService } from "@vscode/services/noteRelocation";
import type { ChangeTaskCoordinator } from "@vscode/services/changeCoordination";
import { RuntimeNoteStateRegistry } from "@vscode/services/runtimeState";

describe("registerNotesResourceEvents()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceFolders.length = 0;
    mocks.renameListeners.length = 0;
    mocks.deleteListeners.length = 0;
    mocks.willDeleteListeners.length = 0;
    mocks.configuredRootDirectory = "";
    mocks.outputDirectory = ".caca";
  });

  it("moves file Notes and Runtime State immediately after a VS Code rename", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("rename");
    const notes = createNotes();
    const notesProvider = createNotesProvider();
    const runtimeRegistry = createRuntimeRegistry(workspaceRoot, "src/old.ts");
    const relocationHistory = createRelocationHistory();
    const context = createExtensionContext();
    const oldUri = createUri(path.join(workspaceRoot, "src/old.ts"));
    const newUri = createUri(path.join(workspaceRoot, "src/new.ts"));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesResourceEvents(
      context,
      notes.value,
      notesProvider.value,
      runtimeRegistry,
      relocationHistory.value,
    );
    mocks.renameListeners[0]?.({
      files: [{ oldUri, newUri }],
    });
    await waitForMicrotasks();

    expect(notes.moveSourceEntriesUnderPath).toHaveBeenCalledWith(
      workspaceRoot,
      ".caca",
      "src/old.ts",
      "src/new.ts",
      expect.any(String),
    );
    expect(runtimeRegistry.getState({
      workspaceRoot,
      outputDirectory: ".caca",
      relativePath: "src/old.ts",
    })).toBeUndefined();
    expect(runtimeRegistry.getState({
      workspaceRoot,
      outputDirectory: ".caca",
      relativePath: "src/new.ts",
    })).toBeDefined();
    expect(relocationHistory.clear).toHaveBeenCalledWith(oldUri.toString());
    expect(relocationHistory.clear).toHaveBeenCalledWith(newUri.toString());
    expect(notesProvider.refreshAfterResourceMove).toHaveBeenCalledWith(oldUri, newUri);
    expect(context.subscriptions).toHaveLength(3);
  });

  it("marks file Notes deleted and clears Runtime State immediately", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("delete");
    const notes = createNotes();
    const notesProvider = createNotesProvider();
    const runtimeRegistry = createRuntimeRegistry(workspaceRoot, "src/deleted.ts");
    const resourceEventSuppression = createResourceEventSuppression();
    const deletedUri = createUri(path.join(workspaceRoot, "src/deleted.ts"));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesResourceEvents(
      createExtensionContext(),
      notes.value,
      notesProvider.value,
      runtimeRegistry,
      undefined,
      resourceEventSuppression.value,
    );
    mocks.willDeleteListeners[0]?.({
      files: [deletedUri],
    } as unknown as vscodeTypes.FileWillDeleteEvent);
    mocks.deleteListeners[0]?.({ files: [deletedUri] });
    await waitForMicrotasks();

    expect(notes.markSourceEntriesUnderPathDeleted).toHaveBeenCalledWith(
      workspaceRoot,
      ".caca",
      "src/deleted.ts",
      expect.any(String),
    );
    expect(runtimeRegistry.getState({
      workspaceRoot,
      outputDirectory: ".caca",
      relativePath: "src/deleted.ts",
    })).toBeUndefined();
    expect(notesProvider.refreshAfterResourceDelete).toHaveBeenCalledWith(deletedUri);
    expect(resourceEventSuppression.markDeleted).toHaveBeenCalledWith(deletedUri);
  });

  it("preserves Runtime State when the Note Store rejects a rename or delete", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("rejected");
    const notes = createNotes();
    const runtimeRegistry = createRuntimeRegistry(workspaceRoot, "src/original.ts");
    const oldUri = createUri(path.join(workspaceRoot, "src/original.ts"));
    const newUri = createUri(path.join(workspaceRoot, "src/renamed.ts"));

    notes.moveSourceEntriesUnderPath.mockResolvedValue({ kind: "conflict" });
    notes.markSourceEntriesUnderPathDeleted.mockResolvedValue({ kind: "notFound" });
    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesResourceEvents(
      createExtensionContext(),
      notes.value,
      undefined,
      runtimeRegistry,
    );
    mocks.renameListeners[0]?.({ files: [{ oldUri, newUri }] });
    mocks.deleteListeners[0]?.({ files: [oldUri] });
    await waitForMicrotasks();

    expect(runtimeRegistry.getState({
      workspaceRoot,
      outputDirectory: ".caca",
      relativePath: "src/original.ts",
    })).toBeDefined();
    expect(runtimeRegistry.getState({
      workspaceRoot,
      outputDirectory: ".caca",
      relativePath: "src/renamed.ts",
    })).toBeUndefined();
  });

  it("ignores source operations involving the managed Note Store", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("managed-store");
    const notes = createNotes();
    const managedUri = createUri(path.join(workspaceRoot, ".caca/notes/index.json"));
    const sourceUri = createUri(path.join(workspaceRoot, "src/index.ts"));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesResourceEvents(createExtensionContext(), notes.value);
    mocks.renameListeners[0]?.({
      files: [{ oldUri: managedUri, newUri: sourceUri }],
    });
    mocks.deleteListeners[0]?.({ files: [managedUri] });
    await waitForMicrotasks();

    expect(notes.moveSourceEntriesUnderPath).not.toHaveBeenCalled();
    expect(notes.markSourceEntriesUnderPathDeleted).not.toHaveBeenCalled();
  });

  it("ignores rename events that cross configured CZaza roots", async () => {
    const firstRoot = await createTempWorkspaceRoot("first");
    const secondRoot = await createTempWorkspaceRoot("second");
    const notes = createNotes();

    mocks.workspaceFolders.push(
      createWorkspaceFolder(firstRoot, 0),
      createWorkspaceFolder(secondRoot, 1),
    );
    registerNotesResourceEvents(createExtensionContext(), notes.value);
    mocks.renameListeners[0]?.({
      files: [
        {
          oldUri: createUri(path.join(firstRoot, "src/old.ts")),
          newUri: createUri(path.join(secondRoot, "src/new.ts")),
        },
      ],
    });
    await waitForMicrotasks();

    expect(notes.moveSourceEntriesUnderPath).not.toHaveBeenCalled();
  });

  it("moves and deletes directory-scoped Runtime State after aggregate Store changes", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("directory");
    const notes = createNotes();
    const runtimeRegistry = createRuntimeRegistry(workspaceRoot, "src/feature/first.ts");
    runtimeRegistry.setState(createRuntimeState(workspaceRoot, "src/feature/nested/second.ts"));
    const oldUri = createUri(path.join(workspaceRoot, "src/feature"));
    const newUri = createUri(path.join(workspaceRoot, "src/domain"));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    registerNotesResourceEvents(
      createExtensionContext(),
      notes.value,
      undefined,
      runtimeRegistry,
    );
    mocks.renameListeners[0]?.({ files: [{ oldUri, newUri }] });
    await waitForMicrotasks();

    expect(runtimeRegistry.getState({
      workspaceRoot,
      outputDirectory: ".caca",
      relativePath: "src/domain/first.ts",
    })).toBeDefined();
    expect(runtimeRegistry.getState({
      workspaceRoot,
      outputDirectory: ".caca",
      relativePath: "src/domain/nested/second.ts",
    })).toBeDefined();

    mocks.deleteListeners[0]?.({ files: [newUri] });
    await waitForMicrotasks();

    expect(runtimeRegistry.listStates({
      workspaceRoot,
      outputDirectory: ".caca",
    })).toEqual([]);
  });
});

/**
 * Creates mock Note resource operations.
 *
 * @returns Workspace Note Store and operation spies.
 */
function createNotes(): {
  value: WorkspaceNoteStore;
  moveSourceEntriesUnderPath: ReturnType<typeof vi.fn>;
  markSourceEntriesUnderPathDeleted: ReturnType<typeof vi.fn>;
} {
  const moveSourceEntriesUnderPath = vi.fn().mockResolvedValue({
    kind: "moved",
    entries: [],
  });
  const markSourceEntriesUnderPathDeleted = vi.fn().mockResolvedValue({
    kind: "markedDeleted",
    relativePaths: [],
  });
  const value = {
    resources: {
      moveSourceEntriesUnderPath,
      markSourceEntriesUnderPathDeleted,
    },
  } as unknown as WorkspaceNoteStore;
  value.scope = vi.fn((workspaceRoot, outputDirectory, location) => ({
    ...value,
    workspaceRoot,
    outputDirectory,
    location,
  })) as unknown as WorkspaceNoteStore["scope"];

  return {
    value,
    moveSourceEntriesUnderPath,
    markSourceEntriesUnderPathDeleted,
  };
}

/**
 * Creates mock Notes view refresh operations.
 *
 * @returns Notes provider and refresh spies.
 */
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

/**
 * Creates one Runtime State entry for a source file.
 *
 * @param workspaceRoot - Absolute workspace root.
 * @param relativePath - Source path relative to the CZaza root.
 * @returns Registry containing one stale source state.
 */
function createRuntimeRegistry(
  workspaceRoot: string,
  relativePath: string,
): RuntimeNoteStateRegistry {
  const registry = new RuntimeNoteStateRegistry();
  registry.setState(createRuntimeState(workspaceRoot, relativePath));
  return registry;
}

/**
 * Creates one stale Runtime State fixture.
 *
 * @param workspaceRoot - Absolute workspace root.
 * @param relativePath - Source path relative to the CZaza root.
 * @returns Runtime state fixture.
 */
function createRuntimeState(workspaceRoot: string, relativePath: string) {
  return {
    workspaceRoot,
    outputDirectory: ".caca",
    relativePath,
    currentSourceHash: "sha256:current",
    issues: ["stale"],
    reason: "sourceChanged",
    observedAt: "2026-07-30T00:00:00.000Z",
    targetChanges: [],
  } as const;
}

/**
 * Creates a mock relocation history service.
 *
 * @returns History interface and clear spy.
 */
function createRelocationHistory(): {
  value: SourceRelocationHistoryService;
  clear: ReturnType<typeof vi.fn>;
} {
  const clear = vi.fn();
  return {
    value: { clear } as unknown as SourceRelocationHistoryService,
    clear,
  };
}

/**
 * Creates a mock deterministic resource-event suppression registry.
 *
 * @returns Registry interface and deletion marker spy.
 */
function createResourceEventSuppression(): {
  value: ChangeTaskCoordinator;
  markDeleted: ReturnType<typeof vi.fn>;
} {
  const markDeleted = vi.fn();
  return {
    value: { markDeleted } as unknown as ChangeTaskCoordinator,
    markDeleted,
  };
}

/**
 * Creates a minimal extension context.
 *
 * @returns Extension context fixture.
 */
function createExtensionContext(): vscodeTypes.ExtensionContext {
  return {
    subscriptions: [],
  } as unknown as vscodeTypes.ExtensionContext;
}

/**
 * Creates one mock workspace folder.
 *
 * @param fsPath - Absolute workspace root.
 * @param index - Workspace folder index.
 * @returns Workspace folder fixture.
 */
function createWorkspaceFolder(fsPath: string, index = 0): MockWorkspaceFolder {
  return {
    uri: createUri(fsPath),
    name: path.basename(fsPath),
    index,
  };
}

/**
 * Creates a local file URI fixture.
 *
 * @param fsPath - Absolute file path.
 * @returns VS Code URI fixture.
 */
function createUri(fsPath: string): vscodeTypes.Uri {
  return {
    scheme: "file",
    fsPath,
    toString: () => `file://${fsPath}`,
  } as vscodeTypes.Uri;
}

/**
 * Waits for event-handler promises queued by void callbacks.
 *
 * @returns Promise resolved after queued microtasks.
 */
async function waitForMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Creates one real temporary workspace root.
 *
 * @param name - Test-specific suffix.
 * @returns Absolute temporary workspace path.
 */
async function createTempWorkspaceRoot(name: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `czaza-resource-events-${name}-`));
}
