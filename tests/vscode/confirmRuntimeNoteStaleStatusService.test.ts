/**
 * Unit tests for hash-guarded Runtime stale confirmation.
 */

import type { StoredSourceFile } from "@shared/models/store/sourceFile";
import { RuntimeNoteStateRegistry } from "@vscode/services/runtimeState/RuntimeNoteStateRegistry";
import { confirmRuntimeNoteStaleStatusService } from "@vscode/services/runtimeState/confirmRuntimeNoteStaleStatusService";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sourceFile: undefined as StoredSourceFile | undefined,
  fingerprintKind: "text" as "text" | "binary",
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
  getResourceFingerprint: async () =>
    mocks.fingerprintKind === "binary"
      ? {
          kind: "binary",
          hash: mocks.fingerprintHash,
        }
      : {
          kind: "text",
          hash: mocks.fingerprintHash,
          programmingLanguage: "typescript",
          document: {
            uri: { scheme: "file", fsPath: "/workspace/src/index.ts" },
            languageId: "typescript",
            getText: () => "const value = 1;",
          },
        },
}));

vi.mock("@vscode/services/runtimeState/refreshRuntimeNoteStateService", () => ({
  refreshRuntimeNoteStateService: mocks.refreshRuntimeNoteStateService,
}));

describe("confirmRuntimeNoteStaleStatusService()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fingerprintKind = "text";
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
    expect(registry.getState({
      workspaceRoot: "/workspace",
      outputDirectory: ".czaza",
      relativePath: "src/index.ts",
    })).toBeUndefined();
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

  it("confirms a matching binary File stale state with its metadata hash", async () => {
    mocks.fingerprintKind = "binary";
    mocks.fingerprintHash = "metadata-sha256:new";
    mocks.sourceFile = {
      ...createSourceFile(),
      source: {
        sourceHash: "metadata-sha256:old",
        sourceHashKind: "metadata",
      },
    };
    const registry = createRegistry({
      content: "stale",
      anchor: "confirmed",
    });
    registry.setState({
      workspaceRoot: "/workspace",
      outputDirectory: ".czaza",
      relativePath: "src/index.ts",
      currentSourceHash: "metadata-sha256:new",
      issues: ["stale"],
      reason: "sourceChanged",
      observedAt: "2026-07-30T00:00:00.000Z",
      targetChanges: [{
        kind: "file",
        status: {
          content: "stale",
          anchor: "confirmed",
        },
      }],
    });

    const result = await confirmRuntimeNoteStaleStatusService({
      uri: {} as never,
      notes: createNotes(),
      registry,
      target: { level: "file" },
    });

    expect(result).toEqual({ kind: "confirmed" });
    expect(mocks.sourceFile?.source).toEqual({
      sourceHash: "metadata-sha256:new",
      sourceHashKind: "metadata",
    });
    expect(mocks.sourceFile?.fileNote?.status.content).toBe("current");
    expect(registry.getState({
      workspaceRoot: "/workspace",
      outputDirectory: ".czaza",
      relativePath: "src/index.ts",
    })).toBeUndefined();
  });

  it("confirms stale content while preserving location review", async () => {
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

    expect(result).toEqual({ kind: "confirmed" });
    expect(mocks.saveSourceFile).toHaveBeenCalledOnce();
    expect(mocks.sourceFile?.fileNote?.status).toEqual({
      content: "current",
      anchor: "needsConfirmation",
    });
    expect(registry.getState({
      workspaceRoot: "/workspace",
      outputDirectory: ".czaza",
      relativePath: "src/index.ts",
    })?.targetChanges[0]?.status).toEqual({
      content: "current",
      anchor: "needsConfirmation",
    });
  });

  it("preserves a Section Note anchor while clearing mixed Runtime stale state", async () => {
    const sourceFile = createSourceFile();
    sourceFile.sectionNotes.push({
      id: "section:intro",
      title: "Intro",
      range: { startLine: 1, endLine: 1 },
      anchorHash: "sha256:original-anchor",
      userNote: "Section review.",
      status: {
        content: "current",
        anchor: "confirmed",
      },
      createdBy: "user",
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z",
    });
    mocks.sourceFile = sourceFile;
    const registry = new RuntimeNoteStateRegistry();
    registry.setState({
      workspaceRoot: "/workspace",
      outputDirectory: ".czaza",
      relativePath: "src/index.ts",
      currentSourceHash: "sha256:new",
      issues: ["stale", "locationReview"],
      reason: "sourceChanged",
      observedAt: "2026-07-29T00:00:00.000Z",
      targetChanges: [{
        kind: "section",
        noteId: "section:intro",
        status: {
          content: "stale",
          anchor: "needsConfirmation",
        },
        range: { startLine: 2, endLine: 2 },
      }],
    });

    const result = await confirmRuntimeNoteStaleStatusService({
      uri: {} as never,
      notes: createNotes(),
      registry,
      target: { level: "section", sectionId: "section:intro" },
    });

    expect(result).toEqual({ kind: "confirmed" });
    expect(mocks.sourceFile?.sectionNotes[0]?.status).toEqual({
      content: "current",
      anchor: "needsConfirmation",
    });
    expect(mocks.sourceFile?.sectionNotes[0]?.anchorHash).toBe("sha256:original-anchor");
    expect(registry.getState({
      workspaceRoot: "/workspace",
      outputDirectory: ".czaza",
      relativePath: "src/index.ts",
    })?.targetChanges[0]).toEqual({
      kind: "section",
      noteId: "section:intro",
      status: {
        content: "current",
        anchor: "needsConfirmation",
      },
      range: { startLine: 2, endLine: 2 },
    });
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
    issues: status.anchor === "confirmed" ? ["stale"] : ["stale", "locationReview"],
    reason: "sourceChanged",
    observedAt: "2026-07-29T00:00:00.000Z",
    targetChanges: [{ kind: "file", status }],
  });
  return registry;
}
