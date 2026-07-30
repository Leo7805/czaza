/**
 * Unit tests for binary resource Runtime Note State reconciliation.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type * as vscodeTypes from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import type { WorkspaceNoteStore } from "@vscode/notes";

type MockWorkspaceFolder = {
  uri: vscodeTypes.Uri;
  name: string;
  index: number;
};

const mocks = vi.hoisted(() => ({
  workspaceFolders: [] as MockWorkspaceFolder[],
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
      get: <T>(key: string, defaultValue: T): T =>
        key === "outputDirectory" ? (".czaza" as T) : defaultValue,
    }),
  },
}));

import {
  refreshBinaryRuntimeNoteStateService,
  RuntimeNoteStateRegistry,
} from "@vscode/services/runtimeState";

describe("refreshBinaryRuntimeNoteStateService()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceFolders.length = 0;
  });

  it("stores a file-level stale overlay when binary metadata changes", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("affected");
    const registry = new RuntimeNoteStateRegistry();
    const notes = createNotes(createBinarySourceFile("metadata-sha256:old"));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    const result = await refreshBinaryRuntimeNoteStateService({
      uri: createUri(`${workspaceRoot}/assets/image.png`),
      currentSourceHash: "metadata-sha256:new",
      notes: notes.value,
      registry,
      now: "2026-07-30T00:00:00.000Z",
    });

    expect(result.kind).toBe("affected");
    expect(result.registryChange).toBe("set");
    expect(
      registry.getState({
        workspaceRoot,
        outputDirectory: ".czaza",
        relativePath: "assets/image.png",
      }),
    ).toEqual(
      expect.objectContaining({
        currentSourceHash: "metadata-sha256:new",
        issues: ["stale"],
        targetChanges: [
          {
            kind: "file",
            status: {
              content: "stale",
              anchor: "confirmed",
            },
          },
        ],
      }),
    );
    expect(notes.saveSourceFile).not.toHaveBeenCalled();
  });

  it("clears an older state when binary metadata matches Notes", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("current");
    const coordinates = {
      workspaceRoot,
      outputDirectory: ".czaza",
      relativePath: "assets/image.png",
    };
    const registry = new RuntimeNoteStateRegistry();
    const notes = createNotes(createBinarySourceFile("metadata-sha256:current"));

    registry.setState({
      ...coordinates,
      currentSourceHash: "metadata-sha256:old",
      issues: ["stale"],
      reason: "sourceChanged",
      observedAt: "2026-07-30T00:00:00.000Z",
      targetChanges: [],
    });
    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    const result = await refreshBinaryRuntimeNoteStateService({
      uri: createUri(`${workspaceRoot}/assets/image.png`),
      currentSourceHash: "metadata-sha256:current",
      notes: notes.value,
      registry,
      now: "2026-07-30T00:00:01.000Z",
    });

    expect(result.kind).toBe("current");
    expect(result.registryChange).toBe("deleted");
    expect(registry.getState(coordinates)).toBeUndefined();
  });

  it("clears an older state when the binary resource has no Notes", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("untracked");
    const coordinates = {
      workspaceRoot,
      outputDirectory: ".czaza",
      relativePath: "assets/image.png",
    };
    const registry = new RuntimeNoteStateRegistry();
    const notes = createNotes(undefined);

    registry.setState({
      ...coordinates,
      issues: ["stale"],
      reason: "sourceChanged",
      observedAt: "2026-07-30T00:00:00.000Z",
      targetChanges: [],
    });
    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));

    const result = await refreshBinaryRuntimeNoteStateService({
      uri: createUri(`${workspaceRoot}/assets/image.png`),
      currentSourceHash: "metadata-sha256:new",
      notes: notes.value,
      registry,
      now: "2026-07-30T00:00:01.000Z",
    });

    expect(result.kind).toBe("untracked");
    expect(result.registryChange).toBe("deleted");
    expect(registry.getState(coordinates)).toBeUndefined();
  });

  it("does not apply a stale asynchronous result", async () => {
    const workspaceRoot = await createTempWorkspaceRoot("obsolete");
    const registry = new RuntimeNoteStateRegistry();
    const notes = createNotes(createBinarySourceFile("metadata-sha256:old"));

    mocks.workspaceFolders.push(createWorkspaceFolder(workspaceRoot));
    const result = await refreshBinaryRuntimeNoteStateService({
      uri: createUri(`${workspaceRoot}/assets/image.png`),
      currentSourceHash: "metadata-sha256:new",
      notes: notes.value,
      registry,
      now: "2026-07-30T00:00:00.000Z",
      canApply: () => false,
    });

    expect(result.kind).toBe("cancelled");
    expect(result.registryChange).toBe("none");
    expect(registry.listStates({
      workspaceRoot,
      outputDirectory: ".czaza",
    })).toHaveLength(0);
  });
});

/**
 * Creates a binary source file with one File Note.
 *
 * @param sourceHash - Persisted metadata fingerprint.
 * @returns Stored binary source fixture.
 */
function createBinarySourceFile(sourceHash: string): StoredSourceFile {
  return {
    source: {
      sourceHash,
      sourceHashKind: "metadata",
    },
    fileNote: {
      id: "file",
      userNote: "Binary note.",
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "user",
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
    },
    sectionNotes: [],
    lineNotes: [],
  };
}

/**
 * Creates a read-only Note Store fixture.
 *
 * @param sourceFile - Optional stored binary Notes.
 * @returns Store and persistent-write spy.
 */
function createNotes(sourceFile: StoredSourceFile | undefined): {
  value: WorkspaceNoteStore;
  saveSourceFile: ReturnType<typeof vi.fn>;
} {
  const saveSourceFile = vi.fn();
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
 * Creates one mock workspace folder.
 *
 * @param fsPath - Absolute workspace root.
 * @returns VS Code workspace folder fixture.
 */
function createWorkspaceFolder(fsPath: string): MockWorkspaceFolder {
  return {
    uri: createUri(fsPath),
    name: path.basename(fsPath),
    index: 0,
  };
}

/**
 * Creates a local file URI fixture.
 *
 * @param fsPath - Absolute resource path.
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
 * Creates one real temporary workspace root for path-boundary checks.
 *
 * @param name - Test-specific directory suffix.
 * @returns Absolute temporary workspace path.
 */
async function createTempWorkspaceRoot(name: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `czaza-binary-runtime-${name}-`));
}
