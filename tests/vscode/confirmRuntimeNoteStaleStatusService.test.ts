/**
 * Unit tests for hash-guarded Runtime stale confirmation.
 */

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { RuntimeNoteStateRegistry } from "@vscode/services/runtimeState/RuntimeNoteStateRegistry";
import { confirmRuntimeNoteStaleStatusService } from "@vscode/services/runtimeState/confirmRuntimeNoteStaleStatusService";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sourceFile: undefined as StoredSourceFile | undefined,
  fingerprintHash: "sha256:new",
  saveSourceFile: vi.fn(),
  refreshRuntimeNoteStateService: vi.fn(),
}));

vi.mock("@vscode/services/resourceAccess", () => ({
  evaluateCzazaResourceAccess: () => ({
    allowed: true,
    relativePath: "src/index.ts",
    root: { rootDirectory: "/workspace" },
    settings: { outputDirectory: ".czaza" },
  }),
}));

vi.mock("@vscode/services/resourceFingerprint/getResourceFingerprintService", () => ({
  getResourceFingerprint: async () => ({
    kind: "text",
    hash: mocks.fingerprintHash,
    programmingLanguage: "typescript",
    document: {
      uri: { scheme: "file", fsPath: "/workspace/src/index.ts" },
      languageId: "typescript",
      getText: () => "const value = 1;",
    },
  }),
}));

vi.mock("@vscode/services/runtimeState/refreshRuntimeNoteStateService", () => ({
  refreshRuntimeNoteStateService: mocks.refreshRuntimeNoteStateService,
}));

describe("confirmRuntimeNoteStaleStatusService()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fingerprintHash = "sha256:new";
    mocks.sourceFile = createSourceFile();
    mocks.saveSourceFile.mockImplementation(
      async (
        _workspaceRoot: string,
        _outputDirectory: string,
        _relativePath: string,
        sourceFile: StoredSourceFile,
      ) => {
        mocks.sourceFile = sourceFile;
      },
    );
  });

  it("confirms pure Runtime stale content after matching the current hash", async () => {
    const registry = createRegistry({
      content: "stale",
      anchor: "confirmed",
    });

    const result = await confirmRuntimeNoteStaleStatusService({
      uri: {} as never,
      notes: createNotes(),
      registry,
      target: { level: "file" },
    });

    expect(result).toEqual({ kind: "confirmed" });
    expect(mocks.saveSourceFile).toHaveBeenCalledOnce();
    expect(mocks.sourceFile?.source).toEqual({
      sourceHash: "sha256:new",
      programmingLanguage: "typescript",
    });
    expect(mocks.sourceFile?.fileNote?.status).toEqual({
      content: "current",
      anchor: "confirmed",
    });
    expect(mocks.refreshRuntimeNoteStateService).toHaveBeenCalledOnce();
  });

  it("refreshes detection without persisting when the current hash changed again", async () => {
    const registry = createRegistry({
      content: "stale",
      anchor: "confirmed",
    });
    mocks.fingerprintHash = "sha256:newer";

    const result = await confirmRuntimeNoteStaleStatusService({
      uri: {} as never,
      notes: createNotes(),
      registry,
      target: { level: "file" },
    });

    expect(result).toEqual({ kind: "outdated" });
    expect(mocks.saveSourceFile).not.toHaveBeenCalled();
    expect(mocks.refreshRuntimeNoteStateService).toHaveBeenCalledOnce();
  });

  it("rejects stale content whose location still needs confirmation", async () => {
    const registry = createRegistry({
      content: "stale",
      anchor: "needsConfirmation",
    });

    const result = await confirmRuntimeNoteStaleStatusService({
      uri: {} as never,
      notes: createNotes(),
      registry,
      target: { level: "file" },
    });

    expect(result).toEqual({ kind: "notConfirmable" });
    expect(mocks.saveSourceFile).not.toHaveBeenCalled();
  });

  it("leaves legacy handling available when no Runtime target exists", async () => {
    const result = await confirmRuntimeNoteStaleStatusService({
      uri: {} as never,
      notes: createNotes(),
      registry: new RuntimeNoteStateRegistry(),
      target: { level: "file" },
    });

    expect(result).toEqual({ kind: "notRuntime" });
    expect(mocks.saveSourceFile).not.toHaveBeenCalled();
  });
});

/**
 * Creates a minimal persistent source file with a current File Note.
 *
 * @returns Stored source fixture.
 */
function createSourceFile(): StoredSourceFile {
  return {
    source: {
      sourceHash: "sha256:old",
      programmingLanguage: "typescript",
    },
    fileNote: {
      id: "file",
      createdBy: "user",
      userNote: "Review.",
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z",
    },
    sectionNotes: [],
    lineNotes: [],
  };
}

/**
 * Creates a minimal Note Store backed by the mutable test fixture.
 *
 * @returns Note Store interface used by the confirmation service.
 */
function createNotes() {
  return {
    cache: {
      getSourceFile: vi.fn().mockImplementation(async () => mocks.sourceFile),
      saveSourceFile: mocks.saveSourceFile,
    },
  } as never;
}

/**
 * Creates a Registry with one File Note Runtime target.
 *
 * @param status - Runtime status exposed to the File Notes panel.
 * @returns Registry containing the matching source resource.
 */
function createRegistry(status: {
  content: "current" | "stale";
  anchor: "confirmed" | "needsConfirmation" | "orphaned";
}): RuntimeNoteStateRegistry {
  const registry = new RuntimeNoteStateRegistry();
  registry.setState({
    workspaceRoot: "/workspace",
    outputDirectory: ".czaza",
    relativePath: "src/index.ts",
    currentSourceHash: "sha256:new",
    issues: ["stale"],
    reason: "sourceChanged",
    observedAt: "2026-07-29T00:00:00.000Z",
    targetChanges: [{ kind: "file", status }],
  });
  return registry;
}
