/**
 * Unit tests for session-only Runtime Note State storage.
 */

import { describe, expect, it, vi } from "vitest";

import { RuntimeNoteStateRegistry } from "@vscode/services/runtimeState/RuntimeNoteStateRegistry";
import type {
  RuntimeNoteIssue,
  RuntimeNoteState,
} from "@vscode/services/runtimeState/runtimeNoteState";

describe("RuntimeNoteStateRegistry", () => {
  it("stores and returns defensive copies of one affected resource", () => {
    const registry = new RuntimeNoteStateRegistry();
    const state = createState("src/index.ts");
    const stored = registry.setState(state);

    (stored.issues as RuntimeNoteIssue[])[0] = "missing";
    const loaded = registry.getState(createCoordinates("src/index.ts"));

    expect(loaded).toEqual(state);
    expect(loaded).not.toBe(state);
    expect(loaded?.targetChanges[0]).not.toBe(state.targetChanges[0]);
  });

  it("replaces an older state for the same normalized resource", () => {
    const registry = new RuntimeNoteStateRegistry();

    registry.setState(createState("./src/index.ts"));
    registry.setState({
      ...createState("src/index.ts"),
      issues: ["locationReview"],
      reason: "anchorChanged",
      observedAt: "2026-07-29T01:00:00.000Z",
    });

    expect(registry.listStates(createScope())).toEqual([
      expect.objectContaining({
        relativePath: "src/index.ts",
        issues: ["locationReview"],
        reason: "anchorChanged",
      }),
    ]);
  });

  it("isolates identical relative paths across workspace and output scopes", () => {
    const registry = new RuntimeNoteStateRegistry();

    registry.setState(createState("src/index.ts"));
    registry.setState({
      ...createState("src/index.ts"),
      workspaceRoot: "/workspace/other",
    });
    registry.setState({
      ...createState("src/index.ts"),
      outputDirectory: ".other",
    });

    expect(registry.listStates(createScope())).toHaveLength(1);
    expect(
      registry.listStates({
        workspaceRoot: "/workspace/other",
        outputDirectory: ".czaza",
      }),
    ).toHaveLength(1);
    expect(
      registry.listStates({
        workspaceRoot: "/workspace/project",
        outputDirectory: ".other",
      }),
    ).toHaveLength(1);
  });

  it("deletes one state and clears only the requested scope", () => {
    const registry = new RuntimeNoteStateRegistry();

    registry.setState(createState("src/first.ts"));
    registry.setState(createState("src/second.ts"));
    registry.setState({
      ...createState("src/other.ts"),
      workspaceRoot: "/workspace/other",
    });

    expect(registry.deleteState(createCoordinates("src/first.ts"))).toBe(true);
    expect(registry.deleteState(createCoordinates("src/missing.ts"))).toBe(false);
    expect(registry.clearScope(createScope())).toBe(1);
    expect(registry.listStates(createScope())).toEqual([]);
    expect(
      registry.listStates({
        workspaceRoot: "/workspace/other",
        outputDirectory: ".czaza",
      }),
    ).toHaveLength(1);
  });

  it("moves a state without retaining the old resource key", () => {
    const registry = new RuntimeNoteStateRegistry();

    registry.setState(createState("src/old.ts"));
    const moved = registry.moveState(
      createCoordinates("src/old.ts"),
      "./src/new.ts",
    );

    expect(moved?.relativePath).toBe("src/new.ts");
    expect(registry.getState(createCoordinates("src/old.ts"))).toBeUndefined();
    expect(registry.getState(createCoordinates("src/new.ts"))).toEqual(moved);
  });

  it("publishes mutations until the listener is disposed", () => {
    const registry = new RuntimeNoteStateRegistry();
    const listener = vi.fn();
    const disposable = registry.onDidChange(listener);

    registry.setState(createState("src/old.ts"));
    registry.moveState(createCoordinates("src/old.ts"), "src/new.ts");
    registry.deleteState(createCoordinates("src/new.ts"));
    disposable.dispose();
    registry.setState(createState("src/ignored.ts"));

    expect(listener.mock.calls.map(([change]) => change.kind)).toEqual([
      "set",
      "move",
      "delete",
    ]);
  });

  it("rejects states that contain no issue or target-level change", () => {
    const registry = new RuntimeNoteStateRegistry();

    expect(() =>
      registry.setState({
        ...createState("src/index.ts"),
        issues: [],
        targetChanges: [],
      }),
    ).toThrow("Runtime Note state must contain an issue or target change.");
  });
});

/**
 * Creates a representative stale Line Note runtime state.
 *
 * @param relativePath - Source path stored in the state.
 * @returns Runtime state fixture.
 */
function createState(relativePath: string): RuntimeNoteState {
  return {
    workspaceRoot: "/workspace/project",
    outputDirectory: ".czaza",
    relativePath,
    currentSourceHash: "sha256:current",
    issues: ["stale"],
    reason: "sourceChanged",
    observedAt: "2026-07-29T00:00:00.000Z",
    targetChanges: [
      {
        kind: "line",
        noteId: "line:1",
        line: 12,
        status: {
          content: "stale",
          anchor: "needsConfirmation",
        },
      },
    ],
  };
}

/**
 * Creates coordinates for one fixture source path.
 *
 * @param relativePath - Source path to address.
 * @returns Runtime registry coordinates.
 */
function createCoordinates(relativePath: string) {
  return {
    ...createScope(),
    relativePath,
  };
}

/**
 * Creates the primary fixture workspace scope.
 *
 * @returns Runtime registry scope.
 */
function createScope() {
  return {
    workspaceRoot: "/workspace/project",
    outputDirectory: ".czaza",
  };
}
