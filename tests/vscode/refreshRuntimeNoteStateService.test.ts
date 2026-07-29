/**
 * Unit tests for reconciling read-only detection with Runtime Note State storage.
 */

import type { FileNotesDetectionReport } from "@shared/services/notes/noteDetectionService";
import type { WorkspaceNoteStore } from "@vscode/notes";
import { RuntimeNoteStateRegistry } from "@vscode/services/runtimeState/RuntimeNoteStateRegistry";
import type {
  DetectRuntimeNoteStateResult,
  RuntimeNoteDetectionDocument,
} from "@vscode/services/runtimeState/detectRuntimeNoteStateService";
import type { RuntimeNoteState } from "@vscode/services/runtimeState/runtimeNoteState";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  detect: vi.fn(),
}));

vi.mock(
  "@vscode/services/runtimeState/detectRuntimeNoteStateService",
  () => ({
    detectRuntimeNoteStateService: mocks.detect,
  }),
);

import { refreshRuntimeNoteStateService } from "@vscode/services/runtimeState/refreshRuntimeNoteStateService";

describe("refreshRuntimeNoteStateService()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores affected detection state", async () => {
    const registry = new RuntimeNoteStateRegistry();
    const state = createState("sha256:new");

    mocks.detect.mockResolvedValue({
      kind: "affected",
      relativePath: "src/index.ts",
      report: createDetectionReport(),
      state,
    } satisfies DetectRuntimeNoteStateResult);

    const result = await refreshRuntimeNoteStateService(
      createInput(registry),
    );

    expect(result.registryChange).toBe("set");
    expect(registry.getState(createCoordinates())).toEqual(state);
  });

  it("replaces an older state for the same resource", async () => {
    const registry = new RuntimeNoteStateRegistry();

    registry.setState(createState("sha256:old"));
    mocks.detect.mockResolvedValue({
      kind: "affected",
      relativePath: "src/index.ts",
      report: createDetectionReport(),
      state: createState("sha256:new"),
    } satisfies DetectRuntimeNoteStateResult);

    await refreshRuntimeNoteStateService(createInput(registry));

    expect(registry.getState(createCoordinates())).toEqual(
      expect.objectContaining({
        currentSourceHash: "sha256:new",
      }),
    );
    expect(registry.listStates(createScope())).toHaveLength(1);
  });

  it("clears old state when the resource becomes current", async () => {
    const registry = new RuntimeNoteStateRegistry();

    registry.setState(createState("sha256:old"));
    mocks.detect.mockResolvedValue({
      kind: "current",
      relativePath: "src/index.ts",
      currentSourceHash: "sha256:current",
      coordinates: createCoordinates(),
    } satisfies DetectRuntimeNoteStateResult);

    const result = await refreshRuntimeNoteStateService(createInput(registry));

    expect(result.registryChange).toBe("deleted");
    expect(registry.getState(createCoordinates())).toBeUndefined();
  });

  it("clears old state when the resource no longer has persistent Notes", async () => {
    const registry = new RuntimeNoteStateRegistry();

    registry.setState(createState("sha256:old"));
    mocks.detect.mockResolvedValue({
      kind: "untracked",
      relativePath: "src/index.ts",
      coordinates: createCoordinates(),
    } satisfies DetectRuntimeNoteStateResult);

    const result = await refreshRuntimeNoteStateService(createInput(registry));

    expect(result.registryChange).toBe("deleted");
    expect(registry.getState(createCoordinates())).toBeUndefined();
  });

  it("leaves Registry state unchanged for Gate-rejected resources", async () => {
    const registry = new RuntimeNoteStateRegistry();
    const state = createState("sha256:old");

    registry.setState(state);
    mocks.detect.mockResolvedValue({
      kind: "ignored",
      reason: "outsideWorkspace",
    } satisfies DetectRuntimeNoteStateResult);

    const result = await refreshRuntimeNoteStateService(createInput(registry));

    expect(result.registryChange).toBe("none");
    expect(registry.getState(createCoordinates())).toEqual(state);
  });

  it("never writes persistent Notes", async () => {
    const registry = new RuntimeNoteStateRegistry();
    const input = createInput(registry);

    mocks.detect.mockResolvedValue({
      kind: "affected",
      relativePath: "src/index.ts",
      report: createDetectionReport(),
      state: createState("sha256:new"),
    } satisfies DetectRuntimeNoteStateResult);

    await refreshRuntimeNoteStateService(input);

    expect(input.notes.cache.saveSourceFile).not.toHaveBeenCalled();
  });
});

/**
 * Creates refresh input with a persistent-write spy.
 *
 * @param registry - Registry under test.
 * @returns Refresh service input.
 */
function createInput(registry: RuntimeNoteStateRegistry) {
  return {
    document: {
      uri: {
        scheme: "file",
        fsPath: "/workspace/project/src/index.ts",
        toString: () => "file:///workspace/project/src/index.ts",
      },
      languageId: "typescript",
      getText: () => "export const value = 2;\n",
    } as RuntimeNoteDetectionDocument,
    notes: {
      cache: {
        saveSourceFile: vi.fn(),
      },
    } as unknown as WorkspaceNoteStore,
    registry,
    now: "2026-07-29T00:00:00.000Z",
  };
}

/**
 * Creates one affected runtime state.
 *
 * @param sourceHash - Current source hash to store.
 * @returns Runtime state fixture.
 */
function createState(sourceHash: string): RuntimeNoteState {
  return {
    ...createCoordinates(),
    currentSourceHash: sourceHash,
    issues: ["stale"],
    reason: "sourceChanged",
    observedAt: "2026-07-29T00:00:00.000Z",
    targetChanges: [
      {
        kind: "file",
        status: {
          content: "stale",
          anchor: "confirmed",
        },
      },
    ],
  };
}

/**
 * Creates a minimal changed-source detection report.
 *
 * @returns Complete detection report fixture.
 */
function createDetectionReport(): FileNotesDetectionReport {
  return {
    file: {
      status: {
        content: "stale",
        anchor: "confirmed",
      },
      sourceHashChanged: true,
      reason: "sourceHashChanged",
      previousSourceHash: "sha256:old",
      currentSourceHash: "sha256:new",
      currentLineCount: 1,
    },
    sections: [],
    lines: [],
  };
}

/**
 * Creates primary fixture resource coordinates.
 *
 * @returns Runtime resource coordinates.
 */
function createCoordinates() {
  return {
    ...createScope(),
    relativePath: "src/index.ts",
  };
}

/**
 * Creates primary fixture Registry scope.
 *
 * @returns Runtime Registry scope.
 */
function createScope() {
  return {
    workspaceRoot: "/workspace/project",
    outputDirectory: ".czaza",
  };
}
